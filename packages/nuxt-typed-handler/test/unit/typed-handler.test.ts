import { defineError } from '@dphonys/nuxt-handler-errors/server'
import { KNOWN_ERROR_KEY } from '@dphonys/nuxt-handler-errors/shared'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  defineTypedEventHandler,
  recognizeKnownError,
  recognizeValidationError,
} from '../../src/runtime/server'
import { postJson, request } from '../h3-app'

// The real internals, with the one seam the errors-only case asserts on
// observed through a spy: `validatedContext` is the only door to a body read.
const { validatedContextSpy } = vi.hoisted(() => ({
  validatedContextSpy: vi.fn(),
}))

vi.mock(
  '@dphonys/nuxt-handler-validation/internals/server',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@dphonys/nuxt-handler-validation/internals/server')
      >()

    return {
      ...actual,
      validatedContext: validatedContextSpy.mockImplementation(
        actual.validatedContext
      ),
    }
  }
)

// Handlers built by `defineTypedEventHandler`, driven by real requests through
// a real h3 app, with both parents' internals imported for real.

const userErrors = defineError({
  'user-not-found': { status: 404 },
  forbidden: { status: 403 },
})

describe('a route declaring only errors', () => {
  it('raises a declared tag through `fail` as the errors parent does', async () => {
    const handler = defineTypedEventHandler(
      { errors: [...userErrors] },
      (_event, { fail }) => fail('user-not-found')
    )

    const response = await request(handler, '/api/test')

    expect(response.status).toBe(404)
    // The marker is the observation: plain h3 withholds `message` off a
    // non-debug app, and the wire suite covers Nitro's envelope.
    await expect(response.json()).resolves.toMatchObject({
      data: { [KNOWN_ERROR_KEY]: { tag: 'user-not-found', status: 404 } },
    })
  })

  it('never calls the validation seam, so the body is never read', async () => {
    // Observed at the seam the internals expose rather than by a body spy:
    // `validatedContext` is the one door to a body read, and it is never
    // opened for a route that declares nothing to validate.
    const handler = defineTypedEventHandler(
      { errors: [...userErrors] },
      () => ({ reached: true })
    )

    const response = await request(handler, '/api/test', {
      init: postJson('{ not json at all'),
    })

    expect(validatedContextSpy).not.toHaveBeenCalled()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ reached: true })
  })
})

describe('a route declaring only validation', () => {
  it('hands the handler exactly the validation parent’s context - no `fail`', async () => {
    const handler = defineTypedEventHandler(
      { validate: { query: z.object({ page: z.coerce.number() }) } },
      (_event, context) => ({
        keys: Object.keys(context),
        page: context.query.page,
      })
    )

    const response = await request(handler, '/api/test?page=2')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      keys: ['query'],
      page: 2,
    })
    expect(validatedContextSpy).toHaveBeenCalled()
  })

  it('answers a rejected source with the built-in variant, both markers on', async () => {
    const handler = defineTypedEventHandler(
      { validate: { query: z.object({ page: z.coerce.number() }) } },
      () => 'the body never runs'
    )

    const seen: unknown[] = []
    const response = await request(handler, '/api/test?page=nope', {
      onError: (error) => seen.push(error),
    })

    expect(response.status).toBe(400)

    const issues = [
      { source: 'query', message: expect.any(String), path: ['page'] },
    ]

    // Inside the known-error marker and beside it: the stripped wire keeps
    // `data.issues`, the first-party wire keeps the variant.
    await expect(response.json()).resolves.toMatchObject({
      statusCode: 400,
      data: {
        issues,
        [KNOWN_ERROR_KEY]: { tag: 'validation-failed', status: 400, issues },
      },
    })

    // The live error is what an observability hook sees: both recognizers.
    expect(recognizeKnownError(seen[0])).toMatchObject({
      tag: 'validation-failed',
      status: 400,
    })
    expect(recognizeValidationError(seen[0])).toMatchObject({ issues })
  })

  it('answers an unparseable body with the same variant and the parent’s issue', async () => {
    const handler = defineTypedEventHandler(
      { validate: { body: z.object({ name: z.string() }) } },
      () => 'the body never runs'
    )

    const response = await request(handler, '/api/test', {
      init: postJson('{ not json at all'),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      data: {
        issues: [
          {
            source: 'body',
            message: 'Request body could not be parsed',
            path: [],
          },
        ],
        [KNOWN_ERROR_KEY]: { tag: 'validation-failed', status: 400 },
      },
    })
  })
})

describe('a route declaring both', () => {
  const both = defineTypedEventHandler(
    {
      validate: { query: z.object({ page: z.coerce.number() }) },
      errors: [...userErrors],
    },
    (_event, context) => {
      if (context.query.page > 1) return context.fail('forbidden')

      return { keys: Object.keys(context).toSorted(), page: context.query.page }
    }
  )

  it('delivers the validated sources and `fail` in one flat context', async () => {
    const response = await request(both, '/api/test?page=1')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      keys: ['fail', 'query'],
      page: 1,
    })
  })

  it('raises a declared failure through `fail`', async () => {
    const response = await request(both, '/api/test?page=2')

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      data: { [KNOWN_ERROR_KEY]: { tag: 'forbidden', status: 403 } },
    })
  })

  it('raises the built-in variant when validation rejects', async () => {
    const response = await request(both, '/api/test?page=nope')

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      data: { [KNOWN_ERROR_KEY]: { tag: 'validation-failed', status: 400 } },
    })
  })

  it('builds a fresh, unfrozen context for every request', async () => {
    const contexts: object[] = []
    const arrivedTouched: boolean[] = []

    const handler = defineTypedEventHandler(
      { errors: [...userErrors] },
      (_event, context) => {
        contexts.push(context)
        arrivedTouched.push('touched' in context)
        // Not frozen: a handler may decorate its own context.
        Object.assign(context, { touched: true })

        return { ok: true }
      }
    )

    await request(handler, '/api/test')
    await request(handler, '/api/test')

    expect(contexts).toHaveLength(2)
    expect(contexts[0]).not.toBe(contexts[1])
    expect(arrivedTouched).toEqual([false, false])
  })
})

describe('declaration-time misuse', () => {
  const foreign = {} as (typeof userErrors)[number]
  const reserved = defineError('validation-failed', { status: 400 })

  it('throws the parents’ and its own messages in the order foreign copy, reserved tag, not a schema', () => {
    const notASchema = { query: 42 as never }

    // All three mistakes at once: the foreign copy wins.
    expect(() =>
      defineTypedEventHandler(
        { validate: notASchema, errors: [foreign, reserved] as never },
        () => null
      )
    ).toThrow(
      '[nuxt-handler-errors] errors[0] is not an error created by this copy of the module. ' +
        'Either it did not come from defineError(), or there are two copies of ' +
        '@dphonys/nuxt-handler-errors in the dependency tree - a version duplicate, or a Nuxt ' +
        'layer or package that resolved its own. Deduplicate it so every error and every ' +
        'handler come from one copy.'
    )

    // Without the foreign copy: the reserved tag, ahead of the schema check.
    expect(() =>
      defineTypedEventHandler(
        { validate: notASchema, errors: [reserved] as never },
        () => null
      )
    ).toThrow(
      '[nuxt-typed-handler] The error tag "validation-failed" is reserved for the built-in validation variant. Rename the declared error.'
    )

    // With a clean declaration: the validation parent's own message.
    expect(() =>
      defineTypedEventHandler(
        { validate: notASchema, errors: [...userErrors] },
        () => null
      )
    ).toThrow(
      '[nuxt-handler-validation] cannot validate query: the value at index 0 is not a Standard Schema. ' +
        "A source slot holds a schema or a non-empty tuple of them - every element must carry a '~standard' property."
    )
  })

  it('throws on a bare `{}` - the compile guard’s answer for a JavaScript caller', () => {
    expect(() => defineTypedEventHandler({} as never, () => null)).toThrow(
      '[nuxt-typed-handler] defineTypedEventHandler needs validate, errors, or both.'
    )
  })

  it('throws on an empty `validate` just the same - it plans nothing', () => {
    expect(() =>
      defineTypedEventHandler({ validate: {} } as never, () => null)
    ).toThrow(
      '[nuxt-typed-handler] defineTypedEventHandler needs validate, errors, or both.'
    )
  })

  it('lets `fail("validation-failed")` hit the parent’s undeclared-tag Error', async () => {
    // `declared` can never carry the tag, so the parent's plain `Error` is
    // the whole answer - no umbrella wording, no marker.
    const handler = defineTypedEventHandler(
      { errors: [...userErrors] },
      // Cast because the compile guard already refuses the tag.
      (_event, { fail }) =>
        (fail as (tag: string) => never)('validation-failed')
    )

    const seen: unknown[] = []
    const response = await request(handler, '/api/test', {
      onError: (error) => seen.push(error),
    })

    expect(response.status).toBe(500)
    expect(seen[0]).toBeInstanceOf(Error)
    expect((seen[0] as Error).message).toBe(
      '[nuxt-handler-errors] undeclared error tag: validation-failed'
    )
    expect(recognizeKnownError(seen[0])).toBeUndefined()
  })
})
