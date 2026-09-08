import { defineError } from '@dphonys/nuxt-handler-errors/server'
import { KNOWN_ERROR_KEY } from '@dphonys/nuxt-handler-errors/shared'
import { validatedContext } from '@dphonys/nuxt-handler-validation/internals/server'
import { postJson, request, requestReporting } from '@dphonys/test-utils/h3-app'
import type { H3Error } from 'h3'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  defineTypedEventHandler,
  recognizeKnownError,
  recognizeValidationError,
} from '../../src/runtime/server'
import type { TypedHandlerInternals } from '../../src/runtime/server/lib/typed-handler'
import { createDefineTypedEventHandler } from '../../src/runtime/server/lib/typed-handler'

// The real internals, with the one seam the errors-only case asserts on
// counted on its way through: `validatedContext` is the only door to a body
// read, and the factory takes it injected. A plain delegating function
// rather than `vi.fn`, which cannot carry the seam's generic signature.
let validatedContextCalls = 0

const observed: TypedHandlerInternals = {
  validatedContext: (event, plan, options) => {
    validatedContextCalls += 1

    return validatedContext(event, plan, options)
  },
}

const defineObserved = createDefineTypedEventHandler(observed)

afterEach(() => {
  validatedContextCalls = 0
})

// Handlers built by `defineTypedEventHandler`, driven by real requests through
// a real h3 app, with both parents' internals imported for real.

const userErrors = defineError({
  'user-not-found': { status: 404 },
  forbidden: { status: 403 },
})

describe('a route declaring only errors', () => {
  it('throws a declared factory result as the errors parent does', async () => {
    const handler = defineTypedEventHandler(
      { errors: [...userErrors] },
      (_event, { errors }) => {
        throw errors.userNotFound()
      }
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
    const handler = defineObserved({ errors: [...userErrors] }, () => ({
      reached: true,
    }))

    const response = await request(handler, '/api/test', {
      init: postJson('{ not json at all'),
    })

    expect(validatedContextCalls).toBe(0)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ reached: true })
  })
})

describe('a route declaring only validation', () => {
  it('hands the handler exactly the validation parent’s context without factories', async () => {
    const handler = defineObserved(
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
    expect(validatedContextCalls).toBe(1)
  })

  it('answers a rejected source with the built-in variant, both markers on', async () => {
    const handler = defineTypedEventHandler(
      { validate: { query: z.object({ page: z.coerce.number() }) } },
      () => 'the body never runs'
    )

    const { response, thrown } = await requestReporting(
      handler,
      '/api/test?page=nope'
    )

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
    expect(recognizeKnownError(thrown)).toMatchObject({
      tag: 'validation-failed',
      status: 400,
    })
    expect(recognizeValidationError(thrown)).toMatchObject({ issues })
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
      if (context.query.page > 1) throw context.errors.forbidden()

      return { keys: Object.keys(context).toSorted(), page: context.query.page }
    }
  )

  it('delivers the validated sources and factories in one flat context', async () => {
    const response = await request(both, '/api/test?page=1')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      keys: ['errors', 'query'],
      page: 1,
    })
  })

  it('throws a declared factory result', async () => {
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
  // A structured clone keeps the type and drops the symbol-keyed internals:
  // exactly what a value from a second copy of the module looks like.
  const foreign = structuredClone(defineError('foreign', { status: 500 }))
  // The compile guards refuse every declaration below; each is what a
  // JavaScript caller can still write, so the runtime answers too.
  const reserved = defineError('validation-failed', { status: 400 })
  const notASchema = { query: 42 }

  it('throws the parents’ and its own messages in the order foreign copy, reserved tag, not a schema', () => {
    // All three mistakes at once: the foreign copy wins.
    expect(() =>
      defineTypedEventHandler(
        // @ts-expect-error - not a schema, and the reserved tag
        { validate: notASchema, errors: [foreign, reserved] },
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
        // @ts-expect-error - not a schema, and the reserved tag
        { validate: notASchema, errors: [reserved] },
        () => null
      )
    ).toThrow(
      '[nuxt-typed-handler] The error tag "validation-failed" is reserved for the built-in validation variant. Rename the declared error.'
    )

    // With a clean declaration: the validation parent's own message.
    expect(() =>
      defineTypedEventHandler(
        // @ts-expect-error - not a schema
        { validate: notASchema, errors: [...userErrors] },
        () => null
      )
    ).toThrow(
      '[nuxt-handler-validation] cannot validate query: the value at index 0 is not a Standard Schema. ' +
        "A source slot holds a schema or a non-empty tuple of them - every element must carry a '~standard' property."
    )
  })

  it('throws on a bare `{}` - the compile guard’s answer for a JavaScript caller', () => {
    // @ts-expect-error - declares nothing
    expect(() => defineTypedEventHandler({}, () => null)).toThrow(
      '[nuxt-typed-handler] defineTypedEventHandler needs validate, errors, or both.'
    )
  })

  it('throws on an empty `validate` just the same - it plans nothing', () => {
    expect(() =>
      // @ts-expect-error - declares nothing
      defineTypedEventHandler({ validate: {} }, () => null)
    ).toThrow(
      '[nuxt-typed-handler] defineTypedEventHandler needs validate, errors, or both.'
    )
  })

  it('does not expose a factory for the built-in validation variant', async () => {
    const handler = defineTypedEventHandler(
      { errors: [...userErrors] },
      (_event, { errors }) => {
        expect('validation-failed' in errors).toBe(false)
        return null
      }
    )

    const seen: H3Error[] = []
    const response = await request(handler, '/api/test', {
      onError: (error) => seen.push(error),
    })

    expect(response.status).toBe(204)
    expect(seen).toEqual([])
  })
})
