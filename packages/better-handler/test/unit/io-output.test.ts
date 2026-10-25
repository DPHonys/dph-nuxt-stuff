import {
  postJson,
  request,
  requestReporting,
  untyped,
  wire,
} from '@dphonys/test-utils/h3-app'
import { defineEventHandler, setResponseStatus } from 'h3'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineBetterEventHandler } from '../../src/runtime/server'
import { schemaReturning, validationFailedBodyOf } from './io-support'

// The output half of the composing wrapper, without a Nuxt boot: what a
// route declaring `output` sends for what its Handler hands back. The
// development check is off throughout, as a plain suite run starts it; its
// own suite is `io-response-check.test.ts`.

/** Mounted on h3's router, so `event.path` is the path a sentence names. */
const ROUTE = '/api/receipts'

/** One request to a Handler mounted at `ROUTE`. */
function answer(handler: Parameters<typeof request>[0], path = ROUTE) {
  return request(handler, path, { route: ROUTE })
}

const receipt = z.object({ id: z.string(), total: z.number() })
const existing = z.object({ id: z.string() })
const created = z.object({ id: z.string(), createdAt: z.string() })

describe('a route declaring a bare output', () => {
  it('sends what the Handler returned, untouched by the schema', async () => {
    // The schema strips and coerces; nothing runs it, so the answer is the
    // Handler's own object, extra key and string page included.
    const route = defineBetterEventHandler(
      { output: z.object({ page: z.coerce.number() }) },
      () => wire('{"page":"2","extra":true}')
    )

    const response = await answer(route)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ page: '2', extra: true })
  })

  it('answers 200 whatever status the Handler set', async () => {
    // The declaration promised the body under `200` and nothing else.
    const route = defineBetterEventHandler({ output: receipt }, (event) => {
      setResponseStatus(event, 201)

      return { id: 'r-1', total: 3 }
    })

    const response = await answer(route)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ id: 'r-1', total: 3 })
  })

  it('answers 200 whatever status was set before the Handler ran', async () => {
    // What a middleware leaves behind: a status already on the response when
    // the route is entered.
    const route = defineBetterEventHandler({ output: receipt }, () => ({
      id: 'r-1',
      total: 3,
    }))

    const response = await answer(
      defineEventHandler((event) => {
        setResponseStatus(event, 202)

        return route(event)
      })
    )

    expect(response.status).toBe(200)
  })

  it('hands an output-only route an empty context', async () => {
    const route = defineBetterEventHandler(
      { output: z.object({ keys: z.array(z.string()) }) },
      (_event, context) => ({ keys: Object.keys(context) })
    )

    await expect((await answer(route)).json()).resolves.toEqual({ keys: [] })
  })

  it('validates nothing on an output-only route, so never rejects a request', async () => {
    const route = defineBetterEventHandler(
      { output: z.object({ ok: z.boolean() }) },
      () => ({ ok: true })
    )

    // A body that is no JSON: a route validating its body would answer the
    // Built-in validation-failed variant, and one reading it h3's own `400`.
    const response = await request(route, ROUTE, {
      route: ROUTE,
      init: postJson('{ not json at all'),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it('validates the declared sources beside it, as ever', async () => {
    const route = defineBetterEventHandler(
      {
        input: { query: z.object({ page: z.coerce.number() }) },
        output: z.object({ page: z.number() }),
      },
      (_event, { query }) => ({ page: query.page })
    )

    const ok = await answer(route, `${ROUTE}?page=2`)
    const bad = await answer(route, `${ROUTE}?page=nope`)

    await expect(ok.json()).resolves.toEqual({ page: 2 })
    expect(bad.status).toBe(400)
    expect((await validationFailedBodyOf(bad)).data._tag).toBe(
      'validation-failed'
    )
  })

  it('offers the Handler no Respond helper', async () => {
    const route = defineBetterEventHandler(
      { output: z.object({ keys: z.array(z.string()) }) },
      (_event, context) => ({ keys: Object.keys(context) })
    )

    await expect((await answer(route)).json()).resolves.toEqual({ keys: [] })
  })

  it('takes a hand-written Standard Schema, plain object and all', async () => {
    // Told apart from a status map by its `~standard` property, not by its
    // prototype.
    const route = defineBetterEventHandler(
      { output: schemaReturning({ value: { ok: true } }) },
      () => ({ ok: true })
    )

    expect((await answer(route)).status).toBe(200)
  })
})

describe('a route declaring a status map', () => {
  it('sends the status the Handler responded with, and its value as the body', async () => {
    const route = defineBetterEventHandler(
      { output: { 200: existing, 201: created } },
      (_event, { respond }) =>
        respond(201, { id: '1', createdAt: '2026-10-25' })
    )

    const response = await answer(route)

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({
      id: '1',
      createdAt: '2026-10-25',
    })
  })

  it('sends another declared status from the same route', async () => {
    const route = defineBetterEventHandler(
      { output: { 200: existing, 201: created } },
      (_event, { respond }) => respond(200, { id: '1' })
    )

    const response = await answer(route)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ id: '1' })
  })

  it('sends a status declared null with no body at all', async () => {
    const route = defineBetterEventHandler(
      { output: { 204: null } },
      (_event, { respond }) => respond(204)
    )

    const response = await answer(route)

    expect(response.status).toBe(204)
    await expect(response.text()).resolves.toBe('')
  })

  it('lets any status be declared null, not only 204', async () => {
    const route = defineBetterEventHandler(
      { output: { 205: null } },
      (_event, { respond }) => respond(205)
    )

    const response = await answer(route)

    expect(response.status).toBe(205)
    await expect(response.text()).resolves.toBe('')
  })

  // 204 and 205 are statuses the fetch standard never lets carry a body, so
  // a client could not tell a leak there; 202 and 200 may carry one.
  it.each([202, 200])(
    'sends no body under %i declared null, even when a caller passed one',
    async (status) => {
      // `respond(status, value)` is a compile error for a status declared
      // `null`; a plain-JavaScript route file can still write it, and the
      // declaration decides what goes out.
      const route = defineBetterEventHandler(
        { output: { [status]: null, 201: created } },
        (_event, { respond }) => untyped(respond)(status, { leaked: true })
      )

      const response = await answer(route)

      await expect(response.text()).resolves.toBe('')
      expect(response.headers.get('content-type')).toBeNull()
    }
  )

  it('keeps the status declared null, 202 included', async () => {
    const route = defineBetterEventHandler(
      { output: { 202: null } },
      (_event, { respond }) => untyped(respond)(202, { leaked: true })
    )

    expect((await answer(route)).status).toBe(202)
  })

  it('sends what the Handler responded with, untouched by the schema', async () => {
    const parsed: unknown = wire('{"id":"1","extra":true}')

    const route = defineBetterEventHandler(
      { output: { 200: existing } },
      (_event, { respond }) => untyped(respond)(200, parsed)
    )

    const response = await answer(route)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ id: '1', extra: true })
  })

  it('hands the Respond helper beside the validated sources and the Fail helper', async () => {
    const route = defineBetterEventHandler(
      {
        input: { query: z.object({ page: z.coerce.number() }) },
        output: { 200: z.object({ keys: z.array(z.string()) }) },
        errors: { 'order-locked': { status: 409 } },
      },
      (_event, context) =>
        context.respond(200, { keys: Object.keys(context).toSorted() })
    )

    const response = await answer(route, `${ROUTE}?page=2`)

    await expect(response.json()).resolves.toEqual({
      keys: ['fail', 'query', 'respond'],
    })
  })

  it('leaves a thrown Known error its own wire', async () => {
    const route = defineBetterEventHandler(
      {
        output: { 201: created },
        errors: { 'order-locked': { status: 409 } },
      },
      (_event, { fail }) => {
        throw fail('order-locked')
      }
    )

    const response = await answer(route)

    expect(response.status).toBe(409)
    expect((await response.json()).data).toEqual({ _tag: 'order-locked' })
  })

  it('refuses a plain return, single-status map included', async () => {
    // The compile guard's answer for a plain-JavaScript caller: a map
    // declares how the Handler answers, and a bare value names no status.
    // Refused in production too, as there is no status to send it under.
    const route = defineBetterEventHandler(
      wire('{"output":{"201":null}}'),
      () => ({ id: '1' })
    )

    const { response, thrown } = await requestReporting(route, ROUTE, {
      route: ROUTE,
    })

    expect(response.status).toBe(500)
    expect(thrown.data).toBeUndefined()
    expect(thrown.message).toBe(
      `[better-handler] cannot send the response: GET ${ROUTE} declares a status map, so it must return the Respond helper's result, and a plain object is not one. ` +
        'Return respond(status, value) - or respond(status) for a status declared null - from the Handler.'
    )
  })

  it('refuses a hand-written lookalike of the helper’s result', async () => {
    // Only the helper's own symbol makes a result; a structural copy names a
    // status nobody declared through it.
    const route = defineBetterEventHandler(
      wire('{"output":{"200":null}}'),
      () => ({ status: 200, body: { id: '1' } })
    )

    const { thrown } = await requestReporting(route, ROUTE, { route: ROUTE })

    expect(thrown.statusCode).toBe(500)
    expect(thrown.message).toContain('a plain object is not one')
  })
})

describe('an output that declares no reply', () => {
  it('declares nothing as an empty map beside a declared source', async () => {
    // As an empty `errors` map beside `input` declares nothing: no Respond
    // helper, and the Handler's return passed straight through.
    const route = defineBetterEventHandler(
      untyped({ input: { query: z.object({ q: z.string() }) }, output: {} }),
      (_event, context) => ({ keys: Object.keys(context) })
    )

    const response = await answer(route, `${ROUTE}?q=x`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ keys: ['query'] })
  })
})

/** Evaluate a route declaring `output`, as a route module does. */
function declaring<Output>(output: Output): () => void {
  return () => defineBetterEventHandler(untyped({ output }), () => null)
}

describe('an output that is neither form', () => {
  // Every declaration below is refused by the compile guard too; each is what
  // a plain-JavaScript route file, or a cast, can still write, and each would
  // otherwise leave a route nobody could answer.

  it.each([
    [[], 'an array'],
    [() => null, 'a function'],
    [new Map(), 'an instance of Map'],
    [42, 'the primitive 42'],
    [null, 'null'],
  ])('refuses %j', (output, described) => {
    expect(declaring(output)).toThrow(
      new Error(
        `[better-handler] The output of defineBetterEventHandler must be a Standard Schema, for one 200 reply returned plainly, or a map from status to schema, not ${described}.`
      )
    )
  })

  it('refuses a status whose slot is neither a schema nor null', () => {
    expect(declaring({ 200: existing, 201: { id: 'string' } })).toThrow(
      new Error(
        '[better-handler] The output for status 201 must be a Standard Schema, or null for a reply with no body, not a plain object.'
      )
    )
  })

  it('refuses a status left undefined, which names no reply', () => {
    expect(declaring({ 204: undefined })).toThrow(
      new Error(
        '[better-handler] The output for status 204 must be a Standard Schema, or null for a reply with no body, not undefined.'
      )
    )
  })

  it('is refused before the route declares nothing', () => {
    // The output rule is the more precise sentence: the author did write one.
    expect(declaring([])).toThrow(/The output of defineBetterEventHandler/)
  })

  it('is refused after a misdeclared input', () => {
    expect(() =>
      defineBetterEventHandler(
        untyped({ input: { quary: existing }, output: [] }),
        () => null
      )
    ).toThrow(/"quary"/)
  })
})
