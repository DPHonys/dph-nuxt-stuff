import {
  postJson,
  request,
  requestReporting,
  untyped,
  wire,
} from '@dphonys/test-utils/h3-app'
import { defineEventHandler, setResponseHeader, setResponseStatus } from 'h3'
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

  it('drops a status message set before the Handler ran', async () => {
    // h3 writes a status message only when given one, so a message left
    // behind would ride the new status: `HTTP/1.1 200 Not Found`. Cleared, a
    // server writes the status's own reason phrase in its place.
    const route = defineBetterEventHandler({ output: receipt }, () => ({
      id: 'r-1',
      total: 3,
    }))

    const response = await answer(
      defineEventHandler((event) => {
        setResponseStatus(event, 404, 'Not Found')

        return route(event)
      })
    )

    expect(response.status).toBe(200)
    expect(response.statusText).toBe('')
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

  it('answers 200 with JSON null when the Handler returns null', async () => {
    // A nullable schema's `null` is a body, which h3 alone would send as a
    // `204` with none: a status the declaration never named, and nothing a
    // client could read as `null`.
    const route = defineBetterEventHandler(
      { output: receipt.nullable() },
      () => null
    )

    const response = await answer(route)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/^application\/json/)
    await expect(response.text()).resolves.toBe('null')
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

  it('keeps 200 when it is the status declared null', async () => {
    // h3 alone sends `null` under `200` as a `204`, a status the map never
    // declared.
    const route = defineBetterEventHandler(
      { output: { 200: null, 201: created } },
      (_event, { respond }) => respond(200)
    )

    const response = await answer(route)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBeNull()
    expect(response.headers.get('content-length')).toBe('0')
    await expect(response.text()).resolves.toBe('')
  })

  it('sends no content-length under 204, which may carry none', async () => {
    const route = defineBetterEventHandler(
      { output: { 204: null } },
      (_event, { respond }) => respond(204)
    )

    const response = await answer(route)

    expect(response.headers.get('content-length')).toBeNull()
  })

  it('drops a status message set before the Handler ran', async () => {
    const route = defineBetterEventHandler(
      { output: { 201: created } },
      (_event, { respond }) =>
        respond(201, { id: '1', createdAt: '2026-10-25' })
    )

    const response = await answer(
      defineEventHandler((event) => {
        setResponseStatus(event, 404, 'Not Found')

        return route(event)
      })
    )

    expect(response.status).toBe(201)
    expect(response.statusText).toBe('')
  })

  it('sends null as the body of a schema whose input is null', async () => {
    // A `z.null()` slot declares a body that is `null`, not a bodiless reply:
    // `respond(201, null)` is the call that answers it, and JSON `null` is
    // what goes out.
    const route = defineBetterEventHandler(
      { output: { 201: z.null() } },
      (_event, { respond }) => respond(201, null)
    )

    const response = await answer(route)

    expect(response.status).toBe(201)
    expect(response.headers.get('content-type')).toMatch(/^application\/json/)
    await expect(response.text()).resolves.toBe('null')
  })

  it('sends JSON null under 200 for a nullable schema’s null', async () => {
    // h3 alone sends `null` under `200` as a `204` with no body.
    const route = defineBetterEventHandler(
      { output: { 200: existing.nullable(), 201: created } },
      (_event, { respond }) => respond(200, null)
    )

    const response = await answer(route)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/^application\/json/)
    await expect(response.text()).resolves.toBe('null')
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

  it.each([202, 200])(
    'keeps the status declared null, %i included, even when a caller passed a body',
    async (status) => {
      const route = defineBetterEventHandler(
        { output: { [status]: null } },
        (_event, { respond }) => untyped(respond)(status, { leaked: true })
      )

      expect((await answer(route)).status).toBe(status)
    }
  )

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

// h3's `onBeforeResponse` is the hook Nitro's `beforeResponse` hooks run in,
// between the Handler's return and the reply. A reply sent ahead of it would
// have its headers out before a hook could set one.
describe('a reply with no body, or a body of null, and the hooks before it', () => {
  /**
   * A hook as Nitro's `beforeResponse` would run it, setting one header and
   * saying whether the reply had already gone out. h3's web seam lets a
   * header be set on an ended reply, which a Node server refuses with
   * `ERR_HTTP_HEADERS_SENT`, so the header alone would prove nothing here.
   */
  const tagging = {
    onBeforeResponse: (event: Parameters<typeof setResponseHeader>[0]) => {
      setResponseHeader(
        event,
        'x-hooked',
        event.node.res.writableEnded ? 'after the reply' : 'yes'
      )
    },
  }

  it('lets a hook set a header on a 200 declared null', async () => {
    const route = defineBetterEventHandler(
      { output: { 200: null } },
      (_event, { respond }) => respond(200)
    )

    const response = await request(route, ROUTE, { route: ROUTE, ...tagging })

    expect(response.status).toBe(200)
    expect(response.headers.get('x-hooked')).toBe('yes')
    await expect(response.text()).resolves.toBe('')
  })

  it('lets a hook set a header on a 200 of JSON null', async () => {
    const route = defineBetterEventHandler(
      { output: receipt.nullable() },
      () => null
    )

    const response = await request(route, ROUTE, { route: ROUTE, ...tagging })

    expect(response.status).toBe(200)
    expect(response.headers.get('x-hooked')).toBe('yes')
    await expect(response.text()).resolves.toBe('null')
  })

  it('lets a hook set a header on a status other than 200 declared null', async () => {
    const route = defineBetterEventHandler(
      { output: { 202: null } },
      (_event, { respond }) => respond(202)
    )

    const response = await request(route, ROUTE, { route: ROUTE, ...tagging })

    expect(response.status).toBe(202)
    expect(response.headers.get('x-hooked')).toBe('yes')
  })

  it('sends the body a hook put in place of JSON null', async () => {
    const route = defineBetterEventHandler(
      { output: receipt.nullable() },
      () => null
    )

    const response = await request(route, ROUTE, {
      route: ROUTE,
      onBeforeResponse: (_event, reply) => {
        reply.body = { rewritten: true }
      },
    })

    await expect(response.json()).resolves.toEqual({ rewritten: true })
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

  it.each([400, 404, 500, 599, 600])(
    'refuses %i, pointing a failure status at errors',
    (status) => {
      // A client fetch throws on 400 and above, so a body declared there
      // would never arrive as data; a failure is a Known error instead.
      expect(declaring({ 200: existing, [status]: existing })).toThrow(
        new Error(
          `[better-handler] The output's key "${status}" must be a status, an integer from 100 to 399 - a failure status is declared under errors, by tag.`
        )
      )
    }
  )

  it.each(['99', '200.5', 'ok', '0200', '-200'])(
    'refuses the key %j, which is no status at all',
    (key) => {
      expect(declaring({ [key]: existing })).toThrow(
        new Error(
          `[better-handler] The output's key "${key}" must be a status, an integer from 100 to 399 - a failure status is declared under errors, by tag.`
        )
      )
    }
  )

  it.each([100, 200, 302, 399])('takes %i as a status', (status) => {
    expect(declaring({ [status]: existing })).not.toThrow()
  })

  it('refuses a status left undefined, which names no reply', () => {
    expect(declaring({ 204: undefined })).toThrow(
      new Error(
        '[better-handler] The output for status 204 must be a Standard Schema, or null for a reply with no body, not undefined.'
      )
    )
  })

  // h3 keeps the current status for a code it cannot send, so each of these
  // would answer whatever status was set before, under a reply declared for
  // another. An output key runs from 100 to 399; a failure is an error's.
  it.each(['2000', '99', '600', 'ok', '200.5', '-200', '0200'])(
    'refuses the key %j, which is no status',
    (key) => {
      expect(declaring({ [key]: existing })).toThrow(
        new Error(
          `[better-handler] The output's key "${key}" must be a status, an integer from 100 to 399 - a failure status is declared under errors, by tag.`
        )
      )
    }
  )

  it.each(['100', '200', '399'])('takes the key %j', (key) => {
    expect(declaring({ [key]: existing })).not.toThrow()
  })

  it('refuses a key that is no status before a slot that is no schema', () => {
    expect(declaring({ ok: { id: 'string' } })).toThrow(/key "ok"/)
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
