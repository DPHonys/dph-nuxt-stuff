import type { StandardSchemaV1 } from '@standard-schema/spec'
import {
  createApp,
  createError,
  defineEventHandler,
  readBody,
  toWebHandler,
} from 'h3'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineValidatedEventHandler } from '../../src/runtime/server'
import type { ValidationSource } from '../../src/runtime/types'
import {
  failureBodyOf,
  postJson,
  request,
  schemaReturning,
  sourcesOfIssues,
  wire,
} from '../h3-app'

// Handlers built by `defineValidatedEventHandler`, driven by real requests
// through a real h3 app; the mounting tools live in `test/h3-app.ts`.

/**
 * A POST whose body stream errors part-way through, rejecting with `reason`.
 * `duplex` is what Node's fetch demands of a streamed body; the DOM lib's
 * `RequestInit` does not know it, so it is named beside it.
 */
function bodyFailingWith(reason: Error): RequestInit & { duplex: 'half' } {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"name":'))
        controller.error(reason)
      },
    }),
    duplex: 'half',
  }
}

describe('a handler declaring a routerParams schema', () => {
  it('hands the body the schema output, coercions applied', async () => {
    const handler = defineValidatedEventHandler(
      { validate: { routerParams: z.object({ id: z.coerce.number() }) } },
      (event, { routerParams }) => ({ id: routerParams.id })
    )

    const response = await request(handler, '/users/42', {
      route: '/users/:id',
    })

    // `toEqual` is strict about `42` against `'42'`: the coercion is observed
    // in the JSON shape itself.
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ id: 42 })
  })

  it('validates decoded params, not percent-escapes', async () => {
    const handler = defineValidatedEventHandler(
      { validate: { routerParams: z.object({ id: z.string() }) } },
      (event, { routerParams }) => ({ id: routerParams.id })
    )

    const response = await request(handler, '/users/a%2Fb', {
      route: '/users/:id',
    })

    // Without h3's `decode: true` this is the raw `a%2Fb`.
    await expect(response.json()).resolves.toEqual({ id: 'a/b' })
  })

  it('delivers a catch-all as one slash-joined string under `_`', async () => {
    const handler = defineValidatedEventHandler(
      { validate: { routerParams: z.object({ _: z.string() }) } },
      (event, { routerParams }) => ({ rest: routerParams._ })
    )

    const response = await request(handler, '/files/a/b%20c/d.txt', {
      route: '/files/**',
    })

    // h3's matcher decides this shape; the package adds nothing.
    await expect(response.json()).resolves.toEqual({ rest: 'a/b c/d.txt' })
  })

  it('answers 400 tagged `routerParams` when the params fail', async () => {
    const handler = defineValidatedEventHandler(
      { validate: { routerParams: z.object({ id: z.coerce.number() }) } },
      () => 'the body never runs'
    )

    const response = await request(handler, '/users/not-a-number', {
      route: '/users/:id',
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      data: { issues: [{ source: 'routerParams', path: ['id'] }] },
    })
  })
})

describe('a handler declaring a query schema', () => {
  it('hands the body the schema output, coercions applied', async () => {
    const handler = defineValidatedEventHandler(
      { validate: { query: z.object({ page: z.coerce.number() }) } },
      (event, { query }) => ({ page: query.page })
    )

    const response = await request(handler, '/api/test?page=2')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ page: 2 })
  })

  it('delivers query as h3 yields it: strings, arrays for repeated keys', async () => {
    const handler = defineValidatedEventHandler(
      {
        validate: {
          query: z.object({ tag: z.array(z.string()), page: z.string() }),
        },
      },
      (event, { query }) => ({ tag: query.tag, page: query.page })
    )

    const response = await request(handler, '/api/test?tag=a&tag=b&page=2')

    // `page` stays the string it arrived as: no coercion is added anywhere,
    // which is what keeps `z.coerce.number()` the user's decision.
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      tag: ['a', 'b'],
      page: '2',
    })
  })

  it('answers 400 with the documented shape when the query fails', async () => {
    let bodyRan = false

    const handler = defineValidatedEventHandler(
      { validate: { query: z.object({ page: z.coerce.number() }) } },
      () => {
        bodyRan = true
        return 'the body never runs'
      }
    )

    const response = await request(handler, '/api/test?page=not-a-number')
    const body = await failureBodyOf(response)

    expect(bodyRan).toBe(false)
    expect(response.status).toBe(400)
    expect(response.statusText).toBe('Validation Error')
    expect(body).toMatchObject({
      statusCode: 400,
      statusMessage: 'Validation Error',
      data: {
        issues: [
          { source: 'query', message: expect.any(String), path: ['page'] },
        ],
      },
    })
  })

  it('reports every issue within the source together', async () => {
    const handler = defineValidatedEventHandler(
      {
        validate: {
          query: z.object({ page: z.coerce.number(), sort: z.enum(['asc']) }),
        },
      },
      () => 'the body never runs'
    )

    const response = await request(handler, '/api/test?page=x&sort=sideways')
    const body = await failureBodyOf(response)

    expect(body.data.issues).toHaveLength(2)
    expect(body.data.issues.map((issue) => issue.source)).toEqual([
      'query',
      'query',
    ])
    expect(body.data.issues.map((issue) => issue.path)).toEqual([
      ['page'],
      ['sort'],
    ])
  })

  it('serves one payload whether the server runs verbose errors or not', async () => {
    const handler = defineValidatedEventHandler(
      { validate: { query: z.object({ page: z.coerce.number() }) } },
      () => 'the body never runs'
    )

    const quiet = await request(handler, '/api/test?page=x')
    const verbose = await request(handler, '/api/test?page=x', { debug: true })

    const quietBody = await failureBodyOf(quiet)
    const verboseBody = await failureBodyOf(verbose)

    // The stack the verbose server adds is h3's; the payload this package
    // raises has no environment branch, so it is the same object under both.
    expect(verbose.status).toBe(quiet.status)
    expect(verboseBody.statusMessage).toBe(quietBody.statusMessage)
    expect(verboseBody.data).toEqual(quietBody.data)
  })
})

describe('a handler declaring a headers schema', () => {
  it('delivers headers as h3 does: lowercase keys, multi-values joined', async () => {
    const handler = defineValidatedEventHandler(
      { validate: { headers: z.object({ 'x-trace': z.string() }) } },
      (event, { headers }) => ({ trace: headers['x-trace'] })
    )

    const response = await request(handler, '/api/test', {
      init: {
        headers: [
          ['X-Trace', 'first'],
          ['X-Trace', 'second'],
        ],
      },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ trace: 'first, second' })
  })

  it('adds no case-insensitivity: a schema keyed as sent finds nothing', async () => {
    const handler = defineValidatedEventHandler(
      { validate: { headers: z.object({ 'X-Trace': z.string() }) } },
      () => 'the body never runs'
    )

    const response = await request(handler, '/api/test', {
      init: { headers: { 'X-Trace': 'sent-in-mixed-case' } },
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      data: { issues: [{ source: 'headers', path: ['X-Trace'] }] },
    })
  })
})

describe('a handler declaring a body schema', () => {
  it('hands the body the schema output, transforms applied', async () => {
    const handler = defineValidatedEventHandler(
      {
        validate: {
          body: z.object({
            name: z.string(),
            tags: z.string().transform((tags) => tags.split(',')),
          }),
        },
      },
      (event, { body }) => ({ name: body.name, tags: body.tags })
    )

    const response = await request(handler, '/api/test', {
      init: postJson(JSON.stringify({ name: 'ada', tags: 'a,b' })),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      name: 'ada',
      tags: ['a', 'b'],
    })
  })

  it('answers 400 tagged `body` when the body fails', async () => {
    const handler = defineValidatedEventHandler(
      { validate: { body: z.object({ name: z.string() }) } },
      () => 'the body never runs'
    )

    const response = await request(handler, '/api/test', {
      init: postJson(JSON.stringify({ name: 42 })),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      data: { issues: [{ source: 'body', path: ['name'] }] },
    })
  })

  it('validates an empty body as undefined', async () => {
    const handler = defineValidatedEventHandler(
      { validate: { body: z.object({ name: z.string() }).optional() } },
      (event, { body }) => ({ bodyIsUndefined: body === undefined })
    )

    const response = await request(handler, '/api/test', {
      init: { method: 'POST' },
    })

    // No special case anywhere: "optional body" is expressed in the schema.
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ bodyIsUndefined: true })
  })
})

describe('the request method and the body read', () => {
  /** One handler serving every verb - the Nitro pattern the skip rule protects. */
  const methodAgnostic = defineValidatedEventHandler(
    { validate: { body: z.object({ name: z.string() }).optional() } },
    (event, { body }) => ({ method: event.method, body: body ?? null })
  )

  /** h3 v1's payload methods - the read is taken for exactly these. */
  const payloadMethods = ['PATCH', 'POST', 'PUT', 'DELETE']

  /**
   * Verbs outside that set, `HEAD` aside. `CONNECT` and `TRACE` are missing
   * only because `Request` refuses to construct them.
   */
  const nonPayloadMethods = ['GET', 'OPTIONS', 'PURGE']

  it.each(payloadMethods)('reads the body on %s', async (method) => {
    const response = await request(methodAgnostic, '/api/test', {
      init: {
        ...postJson(JSON.stringify({ name: 'ada' })),
        method,
      },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      method,
      body: { name: 'ada' },
    })
  })

  it.each(nonPayloadMethods)(
    'validates the body as undefined on %s, without reading it',
    async (method) => {
      const response = await request(methodAgnostic, '/api/test', {
        init: { method },
      })

      // h3's `readRawBody` hard-throws a bare 405 for every verb outside its
      // payload set; skipping the read is what keeps that throw unreachable.
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ method, body: null })
    }
  )

  it('lets a HEAD request through with no bare 405 either', async () => {
    const response = await request(methodAgnostic, '/api/test', {
      init: { method: 'HEAD' },
    })

    // HEAD sends no body to read, so the status is the whole observation.
    expect(response.status).toBe(200)
  })

  it('answers 400 tagged `body`, not 405, when a GET-only route declares one', async () => {
    // The accepted cost of the skip rule: a genuine mis-declaration blames the
    // client, because it is indistinguishable from the pattern above.
    const handler = defineValidatedEventHandler(
      { validate: { body: z.object({ name: z.string() }) } },
      () => 'the body never runs'
    )

    const response = await request(handler, '/api/test', {
      init: { method: 'GET' },
    })

    expect(response.status).toBe(400)
    expect(response.statusText).toBe('Validation Error')
    await expect(response.json()).resolves.toMatchObject({
      data: { issues: [{ source: 'body' }] },
    })
  })
})

describe('any Standard Schema', () => {
  it('validates with valibot exactly as with zod', async () => {
    const handler = defineValidatedEventHandler(
      {
        validate: {
          query: v.object({ page: v.pipe(v.string(), v.transform(Number)) }),
        },
      },
      (event, { query }) => ({ page: query.page })
    )

    const ok = await request(handler, '/api/test?page=7')
    const bad = await request(handler, '/api/test')

    expect(ok.status).toBe(200)
    await expect(ok.json()).resolves.toEqual({ page: 7 })

    expect(bad.status).toBe(400)
    await expect(bad.json()).resolves.toMatchObject({
      data: { issues: [{ source: 'query', path: ['page'] }] },
    })
  })

  it('awaits an async schema', async () => {
    const handler = defineValidatedEventHandler(
      {
        validate: {
          query: v.pipeAsync(
            v.objectAsync({ page: v.string() }),
            v.checkAsync(async ({ page }) => page !== 'nope')
          ),
        },
      },
      (event, { query }) => ({ page: query.page })
    )

    const ok = await request(handler, '/api/test?page=7')
    const bad = await request(handler, '/api/test?page=nope')

    expect(ok.status).toBe(200)
    await expect(ok.json()).resolves.toEqual({ page: '7' })
    expect(bad.status).toBe(400)
  })

  it('discriminates on `issues`, so a value-less success stays a success', async () => {
    // What `'value' in result` would misread as a failure: a successful result
    // whose output is `undefined` and which carries no `value` key at all.
    const valueless: StandardSchemaV1.Result<undefined> = wire('{}')

    const handler = defineValidatedEventHandler(
      { validate: { query: schemaReturning(valueless) } },
      (event, { query }) => ({ valueless: query === undefined })
    )

    const response = await request(handler, '/api/test')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ valueless: true })
  })

  it('refuses a result that reports neither an output nor an issue', async () => {
    // The other side of that discrimination: an empty `issues` array
    // type-checks while naming no output and no reason. Read as a success it
    // invents a value; read as a failure it sends a marked 400 with nothing in
    // it, inviting a hook to skip the route's own bug.
    const handler = defineValidatedEventHandler(
      { validate: { query: schemaReturning({ issues: [] }) } },
      (event, { query }) => ({ received: query })
    )

    const response = await request(handler, '/api/test')

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.not.toMatchObject({
      data: { issues: expect.anything() },
    })
  })

  it('lets a throwing `validate` be a 500, not a validation failure', async () => {
    const handler = defineValidatedEventHandler(
      {
        validate: {
          query: {
            '~standard': {
              version: 1,
              vendor: 'test',
              validate: () => {
                throw new Error('the schema itself is broken')
              },
            },
          },
        },
      },
      () => 'the body never runs'
    )

    const response = await request(handler, '/api/test')

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.not.toMatchObject({
      data: { issues: expect.anything() },
    })
  })
})

describe('a handler declaring several sources', () => {
  /** All four declared at once, each with its own schema. */
  const allFour = defineValidatedEventHandler(
    {
      validate: {
        routerParams: z.object({ id: z.coerce.number() }),
        query: z.object({ page: z.coerce.number() }),
        headers: z.object({ 'x-trace': z.string() }),
        body: z.object({ name: z.string() }),
      },
    },
    (event, { routerParams, query, headers, body }) => ({
      id: routerParams.id,
      page: query.page,
      trace: headers['x-trace'],
      name: body.name,
    })
  )

  /** One request shape, spoiled in exactly the sources named. */
  function send(...bad: ValidationSource[]): Promise<Response> {
    const spoiled = (source: ValidationSource): boolean => bad.includes(source)

    return request(
      allFour,
      `/users/${spoiled('routerParams') ? 'nope' : '42'}?page=${
        spoiled('query') ? 'nope' : '2'
      }`,
      {
        route: '/users/:id',
        init: postJson(
          JSON.stringify({ name: spoiled('body') ? 42 : 'ada' }),
          spoiled('headers') ? {} : { 'x-trace': 'abc' }
        ),
      }
    )
  }

  it('validates every declared source against its own schema', async () => {
    const response = await send()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      id: 42,
      page: 2,
      trace: 'abc',
      name: 'ada',
    })
  })

  it('stops at the first failing source, in the promised order', async () => {
    // Each request is spoiled only in the sources *after* the one it fails on,
    // so the source named in the answer is the order itself.
    const allBad = await send('routerParams', 'query', 'headers', 'body')
    const fromQuery = await send('query', 'headers', 'body')
    const fromHeaders = await send('headers', 'body')
    const fromBody = await send('body')

    await expect(sourcesOfIssues(allBad)).resolves.toEqual(['routerParams'])
    await expect(sourcesOfIssues(fromQuery)).resolves.toEqual(['query'])
    await expect(sourcesOfIssues(fromHeaders)).resolves.toEqual(['headers'])
    await expect(sourcesOfIssues(fromBody)).resolves.toEqual(['body'])
  })

  it('never reads the body once an earlier source has failed', async () => {
    const handler = defineValidatedEventHandler(
      {
        validate: {
          query: z.object({ page: z.coerce.number() }),
          body: z.object({ name: z.string() }),
        },
      },
      () => 'the body never runs'
    )

    const response = await request(handler, '/api/test?page=nope', {
      init: postJson('{ not json at all'),
    })

    // The payload is unparseable, so a body read would have answered with a
    // `source: "body"` issue - naming `query` is the proof it never happened.
    expect(response.status).toBe(400)
    expect(response.statusText).toBe('Validation Error')
    await expect(response.json()).resolves.toMatchObject({
      data: { issues: [{ source: 'query', path: ['page'] }] },
    })
  })
})

describe('a body the read itself refuses', () => {
  const handler = defineValidatedEventHandler(
    { validate: { body: z.object({ name: z.string() }) } },
    () => 'the body never runs'
  )

  /** Every content type h3 v1 parses strictly under the validated door. */
  const strictlyParsed = [
    ['the JSON content type', 'application/json'],
    ['a charset on the JSON content type', 'application/json; charset=utf-8'],
    ['an unrecognized content type', 'application/octet-stream'],
    ['a multipart content type', 'multipart/form-data; boundary=x'],
  ]

  it.each(strictlyParsed)(
    'absorbs an unparseable body into one issue under %s',
    async (_label, contentType) => {
      const response = await request(handler, '/api/test', {
        init: postJson('{ not json at all', { 'content-type': contentType }),
      })

      // Left to h3 this is its own 400 carrying "Invalid JSON body" and no
      // `data.issues` - a second failure shape a client would have to detect
      // differently. `strict: true` is what makes the charset'd header behave
      // like the bare one.
      expect(response.status).toBe(400)
      expect(response.statusText).toBe('Validation Error')

      const body = await failureBodyOf(response)

      // `toEqual`: the message is this package's own, never h3's "Invalid JSON
      // body" - which would make h3's wording part of this wire contract.
      expect(body.data.issues).toEqual([
        {
          source: 'body',
          message: 'Request body could not be parsed',
          path: [],
        },
      ])
    }
  )

  it('serves that answer identically whether the server is verbose or not', async () => {
    const init = postJson('{ not json at all')

    const quiet = await request(handler, '/api/test', { init })
    const verbose = await request(handler, '/api/test', { init, debug: true })

    const quietBody = await failureBodyOf(quiet)
    const verboseBody = await failureBodyOf(verbose)

    expect(verbose.status).toBe(quiet.status)
    expect(verboseBody.data).toEqual(quietBody.data)
  })

  it('lets a 5xx from the read through untouched', async () => {
    const response = await request(handler, '/api/test', {
      init: bodyFailingWith(
        createError({ statusCode: 503, statusMessage: 'Upstream gone' })
      ),
    })

    // The net is stated by status, not by message: only a 4xx is the client's
    // fault, so only a 4xx becomes a validation issue.
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.not.toMatchObject({
      data: { issues: expect.anything() },
    })
  })

  it('lets a non-HTTP throw from the read through untouched', async () => {
    const response = await request(handler, '/api/test', {
      init: bodyFailingWith(new Error('socket hang up')),
    })

    // A dropped connection is a 500, not a request the client sent wrong.
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.not.toMatchObject({
      data: { issues: expect.anything() },
    })
  })
})

describe("what h3 v1's body read delivers", () => {
  // h3 v1's own behaviour, described rather than promised: h3 v2 parses without
  // the content-type branching. What this package does promise sits in the
  // suites above.

  it('parses a form-urlencoded body into an object of string | string[]', async () => {
    const handler = defineValidatedEventHandler(
      {
        validate: {
          body: z.object({ name: z.string(), tag: z.array(z.string()) }),
        },
      },
      (event, { body }) => ({ name: body.name, tag: body.tag })
    )

    const response = await request(handler, '/api/test', {
      init: postJson('name=ada&tag=x&tag=y', {
        'content-type': 'application/x-www-form-urlencoded',
      }),
    })

    // So an HTML form post validates for free.
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      name: 'ada',
      tag: ['x', 'y'],
    })
  })

  it('delivers a text/* body as the raw string, unparsed', async () => {
    const handler = defineValidatedEventHandler(
      { validate: { body: z.string() } },
      (event, { body }) => ({ body })
    )

    const response = await request(handler, '/api/test', {
      init: postJson('{ not json at all', { 'content-type': 'text/plain' }),
    })

    // Not an error: h3 hands `text/*` over unparsed, for the schema to judge.
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      body: '{ not json at all',
    })
  })

  it('parses a body with no content type at all strictly as JSON', async () => {
    const handler = defineValidatedEventHandler(
      { validate: { body: z.object({ name: z.string() }) } },
      (event, { body }) => ({ name: body.name })
    )

    // A `Blob` with no type is how a request carries a body and no
    // `content-type`; a string body would have `text/plain` added for it.
    const send = (payload: string): Promise<Response> =>
      request(handler, '/api/test', {
        init: { method: 'POST', body: new Blob([payload]) },
      })

    const ok = await send(JSON.stringify({ name: 'ada' }))
    const malformed = await send('{ not json at all')

    expect(ok.status).toBe(200)
    await expect(ok.json()).resolves.toEqual({ name: 'ada' })

    expect(malformed.status).toBe(400)
    expect(malformed.statusText).toBe('Validation Error')
  })

  it('parses an unrecognized content type strictly as JSON too', async () => {
    const handler = defineValidatedEventHandler(
      { validate: { body: z.object({ name: z.string() }) } },
      (event, { body }) => ({ name: body.name })
    )

    // Not a failure path: a content type h3 has no rule for still parses. The
    // matching malformed case sits in the catch-net suite above.
    const response = await request(handler, '/api/test', {
      init: postJson(JSON.stringify({ name: 'ada' }), {
        'content-type': 'application/octet-stream',
      }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ name: 'ada' })
  })
})

describe("h3's body memoization", () => {
  it('hands a later reader the cached, unvalidated parse - the stream is never re-read', async () => {
    const handler = defineValidatedEventHandler(
      {
        validate: {
          body: z.object({
            name: z.string().transform((name) => name.toUpperCase()),
          }),
        },
      },
      async (event, { body }) => ({
        validated: body.name,
        // The other door: h3 memoizes its parse, so this is cheap, but it
        // yields what arrived rather than what validated.
        readAgain: (await readBody<{ name: string }>(event)).name,
      })
    )

    const response = await request(handler, '/api/test', {
      init: postJson(JSON.stringify({ name: 'ada' })),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      validated: 'ADA',
      readAgain: 'ada',
    })
  })

  it('keeps every promised invariant when middleware pre-read the body non-strictly', async () => {
    const app = createApp({ debug: false })

    // The upstream direction of the same memoization: middleware calling bare
    // `readBody` caches a non-strictly parsed value first, so this package's
    // `{ strict: true }` is never consulted. Accepted rather than closed.
    app.use(defineEventHandler(async (event) => void (await readBody(event))))
    app.use(
      '/api/test',
      defineValidatedEventHandler(
        { validate: { body: z.object({ name: z.string() }) } },
        () => 'the body never runs'
      )
    )

    const response = await toWebHandler(app)(
      new Request('http://test.local/api/test', {
        method: 'POST',
        // No content type, so the bare read parses non-strictly and yields the
        // raw string instead of throwing.
        body: new Blob(['{ not json at all']),
      })
    )
    const body = await failureBodyOf(response)

    // Only the message drifts from ours to the schema's, which is no worse for
    // the client.
    expect(response.status).toBe(400)
    expect(response.statusText).toBe('Validation Error')
    expect(body.data.issues).toHaveLength(1)
    expect(body.data.issues).toMatchObject([{ source: 'body', path: [] }])
  })
})

describe('the projected issues', () => {
  it('copy nothing across but the message and a normalized path', async () => {
    const secret = Symbol('secret')

    // What a vendor hangs off an issue: valibot's path items carry the raw
    // request input, and none of the extras are JSON-safe. Every path form the
    // interface permits sits in this one issue.
    const vendorIssue = {
      message: 'Expected a number',
      path: [{ key: 'user' }, 0, secret],
      input: { password: 'hunter2' },
      expected: 'number',
    }

    const handler = defineValidatedEventHandler(
      {
        validate: {
          query: schemaReturning({
            issues: [vendorIssue, { message: 'A pathless issue' }],
          }),
        },
      },
      () => 'the body never runs'
    )

    const response = await request(handler, '/api/test')
    const body = await failureBodyOf(response)

    // `toEqual`, not `toMatchObject`: an extra key on an issue is the failure
    // this asserts against.
    expect(body.data.issues).toEqual([
      {
        source: 'query',
        message: 'Expected a number',
        path: ['user', 0, 'Symbol(secret)'],
      },
      { source: 'query', message: 'A pathless issue', path: [] },
    ])
  })

  it('survives a null path segment instead of failing while building the 400', async () => {
    // `typeof null === 'object'`, so this segment used to be dereferenced as an
    // object one - turning a validation failure into a 500 from inside the
    // answer itself. It stringifies instead: never dropped, never `null`.
    const handler = defineValidatedEventHandler(
      {
        validate: {
          // Hand-written, so typed as it would arrive: the interface refuses
          // a `null` segment, and a JSON answer carries one anyway.
          query: schemaReturning(
            wire(
              '{"issues":[{"message":"Expected a number","path":[null,"page"]}]}'
            )
          ),
        },
      },
      () => 'the body never runs'
    )

    const response = await request(handler, '/api/test')
    const body = await failureBodyOf(response)

    expect(response.status).toBe(400)
    expect(response.statusText).toBe('Validation Error')
    expect(body.data.issues).toEqual([
      {
        source: 'query',
        message: 'Expected a number',
        path: ['null', 'page'],
      },
    ])
  })
})
