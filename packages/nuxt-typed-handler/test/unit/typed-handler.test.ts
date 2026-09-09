import { defineError } from '@dphonys/nuxt-handler-errors/server'
import { KNOWN_ERROR_KEY } from '@dphonys/nuxt-handler-errors/shared'
import { postJson, request, requestReporting } from '@dphonys/test-utils/h3-app'
import type { H3Error } from 'h3'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  defineTypedEventHandler,
  recognizeKnownError,
  recognizeValidationError,
} from '../../src/runtime/server'

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

  it('never reads the body', async () => {
    // Observable, not spied: a body that would fail to parse reaches the
    // handler untouched, so the read was never attempted.
    const handler = defineTypedEventHandler(
      { errors: [...userErrors] },
      () => ({
        reached: true,
      })
    )

    const response = await request(handler, '/api/test', {
      init: postJson('{ not json at all'),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ reached: true })
  })
})

describe('a route declaring only validation', () => {
  it('hands the handler exactly the validation parent’s context without factories', async () => {
    const handler = defineTypedEventHandler(
      { input: { query: z.object({ page: z.coerce.number() }) } },
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
  })

  it('answers a rejected source with the built-in variant, both markers on', async () => {
    const handler = defineTypedEventHandler(
      { input: { query: z.object({ page: z.coerce.number() }) } },
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
      { input: { body: z.object({ name: z.string() }) } },
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
      input: { query: z.object({ page: z.coerce.number() }) },
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
        { input: notASchema, errors: [foreign, reserved] },
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
        { input: notASchema, errors: [reserved] },
        () => null
      )
    ).toThrow(
      '[nuxt-typed-handler] The error tag "validation-failed" is reserved for the built-in validation variant. Rename the declared error.'
    )

    // With a clean declaration: the validation parent's own message.
    expect(() =>
      defineTypedEventHandler(
        // @ts-expect-error - not a schema
        { input: notASchema, errors: [...userErrors] },
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
      '[nuxt-typed-handler] defineTypedEventHandler must declare input, errors, output, or any combination.'
    )
  })

  it('throws on an empty `input` just the same - it plans nothing', () => {
    expect(() =>
      // @ts-expect-error - declares nothing
      defineTypedEventHandler({ input: {} }, () => null)
    ).toThrow(
      '[nuxt-typed-handler] defineTypedEventHandler must declare input, errors, output, or any combination.'
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

describe('a route declaring a Response output', () => {
  it('sends what the handler returned, untouched by the schema', async () => {
    // The declared schema coerces and strips; nothing runs it, so the answer
    // is the handler's own object, extra key and string page included.
    // What a plain-JavaScript route file hands over: parsed, so the value is
    // honestly untyped rather than cast into place.
    const untyped: unknown = JSON.parse('{"page":"2","extra":true}')

    const handler = defineTypedEventHandler(
      { output: z.object({ page: z.coerce.number() }) },
      // @ts-expect-error - `unknown` is not the declared output type
      () => untyped
    )

    const response = await request(handler, '/api/test')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      page: '2',
      extra: true,
    })
  })

  it('hands an output-only route an empty Handler context', async () => {
    // No source and no error declaration: no validated keys, no factories.
    const handler = defineTypedEventHandler(
      { output: z.object({ keys: z.array(z.string()) }) },
      (_event, ctx) => ({ keys: Object.keys(ctx) })
    )

    const response = await request(handler, '/api/test')

    await expect(response.json()).resolves.toEqual({ keys: [] })
  })

  it('never reads the body of an output-only route', async () => {
    const handler = defineTypedEventHandler(
      { output: z.object({ reached: z.boolean() }) },
      () => ({ reached: true })
    )

    const response = await request(handler, '/api/test', {
      init: postJson('{ not json at all'),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ reached: true })
  })

  it('validates the declared sources beside the output, as ever', async () => {
    const handler = defineTypedEventHandler(
      {
        input: { query: z.object({ page: z.coerce.number() }) },
        output: z.object({ page: z.number() }),
      },
      (_event, { query }) => ({ page: query.page })
    )

    const ok = await request(handler, '/api/test?page=2')
    const bad = await request(handler, '/api/test?page=nope')

    await expect(ok.json()).resolves.toEqual({ page: 2 })
    expect(bad.status).toBe(400)
    await expect(bad.json()).resolves.toMatchObject({
      data: { [KNOWN_ERROR_KEY]: { tag: 'validation-failed', status: 400 } },
    })
  })
})

describe('a route declaring a Response output as a status map', () => {
  /** The two bodies the map below promises, one per declared status. */
  const existing = z.object({ id: z.string() })
  const created = z.object({ id: z.string(), createdAt: z.string() })

  it('sends the status the handler responded with, and its value as the body', async () => {
    const handler = defineTypedEventHandler(
      { output: { 200: existing, 201: created } },
      (_event, { respond }) =>
        respond(201, { id: '1', createdAt: '2026-09-09' })
    )

    const response = await request(handler, '/api/test')

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({
      id: '1',
      createdAt: '2026-09-09',
    })
  })

  it('sends a status declared `null` with no body at all', async () => {
    const handler = defineTypedEventHandler(
      { output: { 204: null } },
      (_event, { respond }) => respond(204)
    )

    const response = await request(handler, '/api/test')

    expect(response.status).toBe(204)
    await expect(response.text()).resolves.toBe('')
  })

  it('hands `respond` over beside the sources and the error factories', async () => {
    const handler = defineTypedEventHandler(
      {
        input: { query: z.object({ page: z.coerce.number() }) },
        errors: [...userErrors],
        output: { 200: z.object({ keys: z.array(z.string()) }) },
      },
      (_event, ctx) => ctx.respond(200, { keys: Object.keys(ctx).toSorted() })
    )

    const response = await request(handler, '/api/test?page=2')

    await expect(response.json()).resolves.toEqual({
      keys: ['errors', 'query', 'respond'],
    })
  })

  it('rejects a source before the handler can respond at all', async () => {
    const handler = defineTypedEventHandler(
      {
        input: { query: z.object({ page: z.coerce.number() }) },
        output: { 201: existing },
      },
      (_event, { respond }) => respond(201, { id: '1' })
    )

    const response = await request(handler, '/api/test?page=nope')

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      data: { [KNOWN_ERROR_KEY]: { tag: 'validation-failed', status: 400 } },
    })
  })
})
