import {
  postJson,
  request,
  requestReporting,
  untyped,
  wire,
} from '@dphonys/test-utils/h3-app'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { EventHandler } from 'h3'
import {
  createApp,
  createError,
  defineEventHandler,
  readBody,
  toWebHandler,
} from 'h3'
import * as v from 'valibot'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  defineBetterEventHandler,
  recognizeKnownError,
} from '../../src/runtime/server'
import { setDevChecks } from '../../src/runtime/server/dev-checks'
import type { ValidationSource } from '../../src/runtime/types'
import {
  schemaReturning,
  sourcesOfIssues,
  validationFailedBodyOf,
} from './io-support'

// The input half of the composing wrapper, without a Nuxt boot: what a route
// declaring `input` hands its Handler, and what it answers when a source is
// rejected. Each request mounts the Handler on a real h3 app.

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

/** Whether a failure body is the Built-in validation-failed variant at all. */
async function carriesIssues(response: Response): Promise<boolean> {
  const body: { data?: { issues?: unknown } } = await response.json()

  return body.data?.issues !== undefined
}

afterEach(() => {
  setDevChecks(false)
})

describe('the Built-in validation-failed variant', () => {
  const handler = defineBetterEventHandler(
    { input: { query: z.object({ page: z.coerce.number() }) } },
    () => 'the Handler never runs'
  )

  it('goes out as 400 with the tag as message and data { _tag, issues }', async () => {
    const { response, thrown } = await requestReporting(
      handler,
      '/api/test?page=nope'
    )

    expect(response.status).toBe(400)
    expect((await validationFailedBodyOf(response)).data).toEqual({
      _tag: 'validation-failed',
      issues: [
        { source: 'query', message: expect.any(String), path: ['page'] },
      ],
    })

    // What a Nitro error hook sees: the errors path's own construction, an
    // ordinary h3 error with no reason phrase of ours, neither fatal nor
    // unhandled, so a production server keeps its `message` and `data`.
    expect(thrown).toMatchObject({
      statusCode: 400,
      message: 'validation-failed',
      fatal: false,
      unhandled: false,
    })
    expect(thrown.statusMessage).toBeUndefined()
  })

  it('is recognised by recognizeKnownError, as any Known error is', async () => {
    const { thrown } = await requestReporting(handler, '/api/test?page=nope')

    expect(recognizeKnownError(thrown)).toEqual({
      _tag: 'validation-failed',
      issues: [
        { source: 'query', message: expect.any(String), path: ['page'] },
      ],
    })
  })

  it('carries nothing beside _tag and issues in data', async () => {
    const response = await request(handler, '/api/test?page=nope')
    const body = await validationFailedBodyOf(response)

    expect(Object.keys(body.data)).toEqual(['_tag', 'issues'])
  })

  it('serves one body whether the server runs verbose errors or not', async () => {
    const quiet = await request(handler, '/api/test?page=nope')
    const verbose = await request(handler, '/api/test?page=nope', {
      debug: true,
    })

    // The stack a verbose server adds is h3's; the error this package raises
    // has no environment branch.
    expect(verbose.status).toBe(quiet.status)
    expect((await validationFailedBodyOf(verbose)).data).toEqual(
      (await validationFailedBodyOf(quiet)).data
    )
  })

  it('goes out the same with the development checks on, beside declared errors', async () => {
    setDevChecks(true)

    const withErrors = defineBetterEventHandler(
      {
        input: { query: z.object({ page: z.coerce.number() }) },
        errors: { 'page-gone': { status: 410 } },
      },
      () => 'the Handler never runs'
    )

    const { response, thrown } = await requestReporting(
      withErrors,
      '/api/test?page=nope'
    )

    // Raised before the Handler, outside the boundary: no undeclared-tag
    // check stands between it and the wire.
    expect(response.status).toBe(400)
    expect(recognizeKnownError(thrown)?._tag).toBe('validation-failed')
  })
})

describe('a route declaring a route schema', () => {
  it('hands the Handler the schema output, coercions applied', async () => {
    const handler = defineBetterEventHandler(
      { input: { route: z.object({ id: z.coerce.number() }) } },
      (_event, { route }) => ({ id: route.id })
    )

    const response = await request(handler, '/users/42', {
      route: '/users/:id',
    })

    // `toEqual` is strict about `42` against `'42'`: the coercion is observed
    // in the JSON itself.
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ id: 42 })
  })

  it('validates decoded params, not percent-escapes', async () => {
    const handler = defineBetterEventHandler(
      { input: { route: z.object({ id: z.string() }) } },
      (_event, { route }) => ({ id: route.id })
    )

    const response = await request(handler, '/users/a%2Fb', {
      route: '/users/:id',
    })

    expect(await response.json()).toEqual({ id: 'a/b' })
  })

  it('delivers a catch-all as one slash-joined string under `_`', async () => {
    const handler = defineBetterEventHandler(
      { input: { route: z.object({ _: z.string() }) } },
      (_event, { route }) => ({ rest: route._ })
    )

    const response = await request(handler, '/files/a/b%20c/d.txt', {
      route: '/files/**',
    })

    expect(await response.json()).toEqual({ rest: 'a/b c/d.txt' })
  })

  it('answers validation-failed naming the route source when the params fail', async () => {
    const handler = defineBetterEventHandler(
      { input: { route: z.object({ id: z.coerce.number() }) } },
      () => 'the Handler never runs'
    )

    const response = await request(handler, '/users/not-a-number', {
      route: '/users/:id',
    })

    expect(response.status).toBe(400)
    expect((await validationFailedBodyOf(response)).data.issues).toMatchObject([
      { source: 'route', path: ['id'] },
    ])
  })
})

describe('a route declaring a query schema', () => {
  it('hands the Handler the schema output, coercions applied', async () => {
    const handler = defineBetterEventHandler(
      { input: { query: z.object({ page: z.coerce.number() }) } },
      (_event, { query }) => ({ page: query.page })
    )

    const response = await request(handler, '/api/test?page=2')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ page: 2 })
  })

  it('delivers the query as h3 yields it: strings, arrays for repeated keys', async () => {
    const handler = defineBetterEventHandler(
      {
        input: {
          query: z.object({ tag: z.array(z.string()), page: z.string() }),
        },
      },
      (_event, { query }) => ({ tag: query.tag, page: query.page })
    )

    const response = await request(handler, '/api/test?tag=a&tag=b&page=2')

    // `page` stays the string it arrived as: no coercion is added anywhere,
    // which keeps `z.coerce.number()` the author's decision.
    expect(await response.json()).toEqual({ tag: ['a', 'b'], page: '2' })
  })

  it('never enters the Handler when the query fails', async () => {
    let entered = false

    const handler = defineBetterEventHandler(
      { input: { query: z.object({ page: z.coerce.number() }) } },
      () => {
        entered = true

        return 'the Handler never runs'
      }
    )

    const response = await request(handler, '/api/test?page=not-a-number')

    expect(response.status).toBe(400)
    expect(entered).toBe(false)
  })

  it('reports every issue within the source together', async () => {
    const handler = defineBetterEventHandler(
      {
        input: {
          query: z.object({ page: z.coerce.number(), sort: z.enum(['asc']) }),
        },
      },
      () => 'the Handler never runs'
    )

    const response = await request(handler, '/api/test?page=x&sort=sideways')
    const { data } = await validationFailedBodyOf(response)

    expect(data.issues.map(({ source, path }) => ({ source, path }))).toEqual([
      { source: 'query', path: ['page'] },
      { source: 'query', path: ['sort'] },
    ])
  })
})

describe('a route declaring a headers schema', () => {
  it('delivers headers as h3 does: lowercase keys, multiple values joined', async () => {
    const handler = defineBetterEventHandler(
      { input: { headers: z.object({ 'x-trace': z.string() }) } },
      (_event, { headers }) => ({ trace: headers['x-trace'] })
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
    expect(await response.json()).toEqual({ trace: 'first, second' })
  })

  it('adds no case-insensitivity: a schema keyed as sent finds nothing', async () => {
    const handler = defineBetterEventHandler(
      { input: { headers: z.object({ 'X-Trace': z.string() }) } },
      () => 'the Handler never runs'
    )

    const response = await request(handler, '/api/test', {
      init: { headers: { 'X-Trace': 'sent-in-mixed-case' } },
    })

    expect(response.status).toBe(400)
    expect((await validationFailedBodyOf(response)).data.issues).toMatchObject([
      { source: 'headers', path: ['X-Trace'] },
    ])
  })
})

describe('a route declaring a body schema', () => {
  it('hands the Handler the schema output, transforms applied', async () => {
    const handler = defineBetterEventHandler(
      {
        input: {
          body: z.object({
            name: z.string(),
            tags: z.string().transform((tags) => tags.split(',')),
          }),
        },
      },
      (_event, { body }) => ({ name: body.name, tags: body.tags })
    )

    const response = await request(handler, '/api/test', {
      init: postJson(JSON.stringify({ name: 'ada', tags: 'a,b' })),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ name: 'ada', tags: ['a', 'b'] })
  })

  it('answers validation-failed naming the body source when the body fails', async () => {
    const handler = defineBetterEventHandler(
      { input: { body: z.object({ name: z.string() }) } },
      () => 'the Handler never runs'
    )

    const response = await request(handler, '/api/test', {
      init: postJson(JSON.stringify({ name: 42 })),
    })

    expect(response.status).toBe(400)
    expect((await validationFailedBodyOf(response)).data.issues).toMatchObject([
      { source: 'body', path: ['name'] },
    ])
  })

  it('validates an empty body as undefined', async () => {
    const handler = defineBetterEventHandler(
      { input: { body: z.object({ name: z.string() }).optional() } },
      (_event, { body }) => ({ bodyIsUndefined: body === undefined })
    )

    const response = await request(handler, '/api/test', {
      init: { method: 'POST' },
    })

    // No special case anywhere: an optional body is the schema's to say.
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ bodyIsUndefined: true })
  })
})

describe('the request method and the body read', () => {
  /** One route serving every verb: the Nitro pattern the skip rule protects. */
  const methodAgnostic = defineBetterEventHandler(
    { input: { body: z.object({ name: z.string() }).optional() } },
    (event, { body }) => ({ method: event.method, body: body ?? null })
  )

  it.each(['PATCH', 'POST', 'PUT', 'DELETE'])(
    'reads the body on %s',
    async (method) => {
      const response = await request(methodAgnostic, '/api/test', {
        init: { ...postJson(JSON.stringify({ name: 'ada' })), method },
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ method, body: { name: 'ada' } })
    }
  )

  it.each(['GET', 'OPTIONS', 'PURGE'])(
    'validates the body as undefined on %s, without reading it',
    async (method) => {
      const response = await request(methodAgnostic, '/api/test', {
        init: { method },
      })

      // h3's body read throws a bare 405 for every verb outside its payload
      // set; skipping the read is what keeps that throw unreachable.
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ method, body: null })
    }
  )

  it('lets a HEAD request through with no bare 405 either', async () => {
    const response = await request(methodAgnostic, '/api/test', {
      init: { method: 'HEAD' },
    })

    expect(response.status).toBe(200)
  })

  it('answers validation-failed, not 405, when a GET route declares a body', async () => {
    // The accepted cost of the skip rule: a genuine misdeclaration blames the
    // client, because it cannot be told from the pattern above.
    const handler = defineBetterEventHandler(
      { input: { body: z.object({ name: z.string() }) } },
      () => 'the Handler never runs'
    )

    const response = await request(handler, '/api/test', {
      init: { method: 'GET' },
    })

    expect(response.status).toBe(400)
    expect(await sourcesOfIssues(response)).toEqual(['body'])
  })
})

describe('a body the read itself refuses', () => {
  const handler = defineBetterEventHandler(
    { input: { body: z.object({ name: z.string() }) } },
    () => 'the Handler never runs'
  )

  it.each([
    ['the JSON content type', 'application/json'],
    ['a charset on the JSON content type', 'application/json; charset=utf-8'],
    ['an unrecognised content type', 'application/octet-stream'],
    ['a multipart content type', 'multipart/form-data; boundary=x'],
  ])('becomes one body issue under %s', async (_label, contentType) => {
    const response = await request(handler, '/api/test', {
      init: postJson('{ not json at all', { 'content-type': contentType }),
    })

    // Left to h3 this is its own 400 carrying "Invalid JSON body" and no
    // issues: a second failure a client would have to detect differently.
    expect(response.status).toBe(400)

    const body = await validationFailedBodyOf(response)

    // `toEqual`: the message is this package's own, never h3's.
    expect(body.data).toEqual({
      _tag: 'validation-failed',
      issues: [
        {
          source: 'body',
          message: 'Request body could not be parsed',
          path: [],
        },
      ],
    })
  })

  it('lets a 5xx from the read through untouched', async () => {
    const response = await request(handler, '/api/test', {
      init: bodyFailingWith(
        createError({ statusCode: 503, statusMessage: 'Upstream gone' })
      ),
    })

    // Only a 4xx is the client's fault, so only a 4xx becomes an issue.
    expect(response.status).toBe(503)
    expect(await carriesIssues(response)).toBe(false)
  })

  it('lets a non-HTTP throw from the read through untouched', async () => {
    const response = await request(handler, '/api/test', {
      init: bodyFailingWith(new Error('socket hang up')),
    })

    // A dropped connection is a 500, not a request the client sent wrong.
    expect(response.status).toBe(500)
    expect(await carriesIssues(response)).toBe(false)
  })
})

describe("what h3 v1's body read delivers", () => {
  // h3 v1's own behaviour, described rather than promised.

  it('parses a form-urlencoded body into an object of string | string[]', async () => {
    const handler = defineBetterEventHandler(
      {
        input: {
          body: z.object({ name: z.string(), tag: z.array(z.string()) }),
        },
      },
      (_event, { body }) => ({ name: body.name, tag: body.tag })
    )

    const response = await request(handler, '/api/test', {
      init: postJson('name=ada&tag=x&tag=y', {
        'content-type': 'application/x-www-form-urlencoded',
      }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ name: 'ada', tag: ['x', 'y'] })
  })

  it('delivers a text/* body as the raw string, unparsed', async () => {
    const handler = defineBetterEventHandler(
      { input: { body: z.string() } },
      (_event, { body }) => ({ body })
    )

    const response = await request(handler, '/api/test', {
      init: postJson('{ not json at all', { 'content-type': 'text/plain' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ body: '{ not json at all' })
  })

  it('parses a body with no content type strictly as JSON', async () => {
    const handler = defineBetterEventHandler(
      { input: { body: z.object({ name: z.string() }) } },
      (_event, { body }) => ({ name: body.name })
    )

    // A `Blob` with no type carries a body and no `content-type`; a string
    // body would have `text/plain` added for it.
    const send = (payload: string): Promise<Response> =>
      request(handler, '/api/test', {
        init: { method: 'POST', body: new Blob([payload]) },
      })

    const ok = await send(JSON.stringify({ name: 'ada' }))
    const malformed = await send('{ not json at all')

    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ name: 'ada' })
    expect(malformed.status).toBe(400)
    expect(await sourcesOfIssues(malformed)).toEqual(['body'])
  })
})

describe("h3's body memoisation", () => {
  it('hands a later reader the cached, unvalidated parse', async () => {
    const handler = defineBetterEventHandler(
      {
        input: {
          body: z.object({
            name: z.string().transform((name) => name.toUpperCase()),
          }),
        },
      },
      async (event, { body }) => ({
        validated: body.name,
        // The other door: h3 memoises its parse, so this is cheap, but it
        // yields what arrived rather than what validated.
        readAgain: (await readBody<{ name: string }>(event)).name,
      })
    )

    const response = await request(handler, '/api/test', {
      init: postJson(JSON.stringify({ name: 'ada' })),
    })

    expect(await response.json()).toEqual({
      validated: 'ADA',
      readAgain: 'ada',
    })
  })

  it('still answers validation-failed when middleware read the body non-strictly first', async () => {
    const app = createApp({ debug: false })

    // Middleware calling bare `readBody` caches a non-strict parse first, so
    // the strict read is never consulted. Accepted rather than closed: the
    // schema rejects the raw string instead.
    app.use(defineEventHandler(async (event) => void (await readBody(event))))
    app.use(
      '/api/test',
      defineBetterEventHandler(
        { input: { body: z.object({ name: z.string() }) } },
        () => 'the Handler never runs'
      )
    )

    const response = await toWebHandler(app)(
      new Request('http://test.local/api/test', {
        method: 'POST',
        body: new Blob(['{ not json at all']),
      })
    )

    expect(response.status).toBe(400)
    expect((await validationFailedBodyOf(response)).data.issues).toMatchObject([
      { source: 'body', path: [] },
    ])
  })
})

describe('a route declaring several sources', () => {
  /** All four declared at once, each with its own schema. */
  const allFour = defineBetterEventHandler(
    {
      input: {
        route: z.object({ id: z.coerce.number() }),
        query: z.object({ page: z.coerce.number() }),
        headers: z.object({ 'x-trace': z.string() }),
        body: z.object({ name: z.string() }),
      },
    },
    (_event, { route, query, headers, body }) => ({
      id: route.id,
      page: query.page,
      trace: headers['x-trace'],
      name: body.name,
    })
  )

  /** One request, spoiled in exactly the sources named. */
  function send(...bad: ValidationSource[]): Promise<Response> {
    const spoiled = (source: ValidationSource): boolean => bad.includes(source)

    return request(
      allFour,
      `/users/${spoiled('route') ? 'nope' : '42'}?page=${spoiled('query') ? 'nope' : '2'}`,
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
    expect(await response.json()).toEqual({
      id: 42,
      page: 2,
      trace: 'abc',
      name: 'ada',
    })
  })

  it('stops at the first failing source, in the order route, query, headers, body', async () => {
    // Each request is spoiled only in the sources from the one it fails on,
    // so the source named in the answer is the order itself.
    expect(
      await sourcesOfIssues(await send('route', 'query', 'headers', 'body'))
    ).toEqual(['route'])
    expect(
      await sourcesOfIssues(await send('query', 'headers', 'body'))
    ).toEqual(['query'])
    expect(await sourcesOfIssues(await send('headers', 'body'))).toEqual([
      'headers',
    ])
    expect(await sourcesOfIssues(await send('body'))).toEqual(['body'])
  })

  it('walks the sources in that order whatever order the declaration writes them in', async () => {
    const reversed = defineBetterEventHandler(
      {
        input: {
          body: z.object({ name: z.string() }),
          headers: z.object({ 'x-trace': z.string() }),
          query: z.object({ page: z.coerce.number() }),
        },
      },
      () => 'the Handler never runs'
    )

    const response = await request(reversed, '/api/test?page=nope', {
      init: postJson(JSON.stringify({ name: 42 })),
    })

    expect(await sourcesOfIssues(response)).toEqual(['query'])
  })

  it('never reads the body once an earlier source has failed', async () => {
    const handler = defineBetterEventHandler(
      {
        input: {
          query: z.object({ page: z.coerce.number() }),
          body: z.object({ name: z.string() }),
        },
      },
      () => 'the Handler never runs'
    )

    const response = await request(handler, '/api/test?page=nope', {
      init: postJson('{ not json at all'),
    })

    // The payload is unparseable, so a body read would have answered with a
    // body issue: naming `query` is the proof it never happened.
    expect(response.status).toBe(400)
    expect((await validationFailedBodyOf(response)).data.issues).toMatchObject([
      { source: 'query', path: ['page'] },
    ])
  })
})

describe('any Standard Schema', () => {
  it('validates with valibot exactly as with zod', async () => {
    const handler = defineBetterEventHandler(
      {
        input: {
          query: v.object({ page: v.pipe(v.string(), v.transform(Number)) }),
        },
      },
      (_event, { query }) => ({ page: query.page })
    )

    const ok = await request(handler, '/api/test?page=7')
    const bad = await request(handler, '/api/test')

    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ page: 7 })
    expect(bad.status).toBe(400)
    expect((await validationFailedBodyOf(bad)).data.issues).toMatchObject([
      { source: 'query', path: ['page'] },
    ])
  })

  it('awaits an async schema', async () => {
    const handler = defineBetterEventHandler(
      {
        input: {
          query: v.pipeAsync(
            v.objectAsync({ page: v.string() }),
            v.checkAsync(async ({ page }) => page !== 'nope')
          ),
        },
      },
      (_event, { query }) => ({ page: query.page })
    )

    const ok = await request(handler, '/api/test?page=7')
    const bad = await request(handler, '/api/test?page=nope')

    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ page: '7' })
    expect(bad.status).toBe(400)
  })

  it('reads a value-less success as a success', async () => {
    // What `'value' in result` would misread as a failure: a successful
    // result whose output is `undefined` and which carries no `value` key.
    const valueless: StandardSchemaV1.Result<undefined> = wire('{}')

    const handler = defineBetterEventHandler(
      { input: { query: schemaReturning(valueless) } },
      (_event, { query }) => ({ valueless: query === undefined })
    )

    const response = await request(handler, '/api/test')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ valueless: true })
  })

  it('refuses a result reporting neither a value nor an issue with a plain 500', async () => {
    // An empty `issues` array type-checks while naming no output and no
    // reason: read as a success it invents a value, read as a failure it
    // sends a validation failure with nothing in it.
    const handler = defineBetterEventHandler(
      { input: { query: schemaReturning<{ page: number }>({ issues: [] }) } },
      (_event, { query }) => ({ received: query })
    )

    // On h3's router, so `event.path` is the path a client asked.
    const { response, thrown } = await requestReporting(handler, '/api/test', {
      route: '/api/test',
    })

    expect(response.status).toBe(500)
    expect(thrown.message).toBe(
      '[better-handler] cannot validate the query of GET /api/test: the schema reported a failure with no issues. ' +
        'A Standard Schema answers with a value or with at least one issue, so this result names neither a value to hand the Handler nor a reason to reject the request.'
    )
    expect(thrown.data).toBeUndefined()
    expect(recognizeKnownError(thrown)).toBeUndefined()
  })

  it('lets a throwing validate be a 500, not a validation failure', async () => {
    const broken = new Error('the schema itself is broken')
    const handler = defineBetterEventHandler(
      {
        input: {
          query: {
            '~standard': {
              version: 1,
              vendor: 'test',
              validate: () => {
                throw broken
              },
            },
          },
        },
      },
      () => 'the Handler never runs'
    )

    const { response, thrown } = await requestReporting(handler, '/api/test')

    expect(response.status).toBe(500)
    expect(thrown.cause).toBe(broken)
    expect(recognizeKnownError(thrown)).toBeUndefined()
  })
})

describe('the projected issues', () => {
  it('copy nothing across but the message and a normalised path', async () => {
    const secret = Symbol('secret')

    // What a vendor hangs off an issue: valibot's path items carry the raw
    // request input, and none of the extras are JSON-safe. Every path form
    // the interface permits sits in this one issue.
    const vendorIssue = {
      message: 'Expected a number',
      path: [{ key: 'user' }, 0, secret],
      input: { password: 'hunter2' },
      expected: 'number',
    }

    const handler = defineBetterEventHandler(
      {
        input: {
          query: schemaReturning({
            issues: [vendorIssue, { message: 'A pathless issue' }],
          }),
        },
      },
      () => 'the Handler never runs'
    )

    const response = await request(handler, '/api/test')

    // `toEqual`: an extra key on an issue is the failure this asserts against.
    expect((await validationFailedBodyOf(response)).data.issues).toEqual([
      {
        source: 'query',
        message: 'Expected a number',
        path: ['user', 0, 'Symbol(secret)'],
      },
      { source: 'query', message: 'A pathless issue', path: [] },
    ])
  })

  it('survive a null path segment instead of failing while building the 400', async () => {
    // `typeof null === 'object'`, so a careless read dereferences it as a
    // carrier and turns the failure into a 500 from inside the answer.
    const handler = defineBetterEventHandler(
      {
        input: {
          query: schemaReturning(
            wire(
              '{"issues":[{"message":"Expected a number","path":[null,"page"]}]}'
            )
          ),
        },
      },
      () => 'the Handler never runs'
    )

    const response = await request(handler, '/api/test')

    expect(response.status).toBe(400)
    expect((await validationFailedBodyOf(response)).data.issues).toEqual([
      { source: 'query', message: 'Expected a number', path: ['null', 'page'] },
    ])
  })

  it('read the key off a null-prototype path segment', async () => {
    // A valid carrier, yet not an `instanceof Object`, and `String()` on it
    // throws: it must be read as a carrier like any other.
    const segment: StandardSchemaV1.PathSegment = Object.assign(
      Object.create(null),
      { key: 'page' }
    )

    const handler = defineBetterEventHandler(
      {
        input: {
          query: schemaReturning({
            issues: [{ message: 'Expected a number', path: [segment] }],
          }),
        },
      },
      () => 'the Handler never runs'
    )

    const response = await request(handler, '/api/test')

    expect(response.status).toBe(400)
    expect((await validationFailedBodyOf(response)).data.issues).toEqual([
      { source: 'query', message: 'Expected a number', path: ['page'] },
    ])
  })

  it('survive a carrier whose key is a null-prototype object', async () => {
    // Outside the interface, which keys a carrier by a property key, and
    // `String()` on it throws: it is described rather than stringified.
    const handler = defineBetterEventHandler(
      {
        input: {
          query: schemaReturning(
            untyped({
              issues: [
                {
                  message: 'Expected a number',
                  path: [{ key: Object.create(null) }, {}],
                },
              ],
            })
          ),
        },
      },
      () => 'the Handler never runs'
    )

    const response = await request(handler, '/api/test')

    expect(response.status).toBe(400)
    expect((await validationFailedBodyOf(response)).data.issues).toEqual([
      {
        source: 'query',
        message: 'Expected a number',
        path: ['an empty object', 'undefined'],
      },
    ])
  })
})

describe('the Handler context', () => {
  it('holds the declared sources and no Fail helper on an input-only route', async () => {
    const seen: string[][] = []
    const handler = defineBetterEventHandler(
      {
        input: {
          query: z.object({ page: z.coerce.number() }),
          headers: z.object({ 'x-trace': z.string() }),
        },
      },
      (_event, context) => {
        seen.push(Object.keys(context))

        return null
      }
    )

    await request(handler, '/api/test?page=1', {
      init: { headers: { 'x-trace': 'abc' } },
    })

    // Undeclared sources are absent, not `undefined`.
    expect(seen).toEqual([['query', 'headers']])
  })

  it('holds the declared sources beside the Fail helper on a route declaring both', async () => {
    const handler = defineBetterEventHandler(
      {
        input: { route: z.object({ id: z.coerce.number() }) },
        errors: { 'order-not-found': { status: 404 } },
      },
      (_event, { route, fail }) => {
        if (route.id > 100) throw fail('order-not-found')

        return { id: route.id }
      }
    )

    const found = await request(handler, '/orders/7', { route: '/orders/:id' })
    const missing = await request(handler, '/orders/404', {
      route: '/orders/:id',
    })

    expect(await found.json()).toEqual({ id: 7 })
    expect(missing.status).toBe(404)
    expect((await missing.json()).data).toEqual({ _tag: 'order-not-found' })
  })

  it('is a fresh object per request', async () => {
    const seen: object[] = []
    const handler = defineBetterEventHandler(
      { input: { query: z.object({ page: z.string() }) } },
      (_event, context) => {
        seen.push(context)

        return null
      }
    )

    await request(handler, '/api/test?page=1')
    await request(handler, '/api/test?page=1')

    expect(seen).toHaveLength(2)
    expect(seen[0]).not.toBe(seen[1])
  })
})

describe('a route without errors', () => {
  it('lets whatever its Handler throws propagate untouched, a _tag included', async () => {
    setDevChecks(true)

    const tagged = { _tag: 'order-paid' }
    const handler = defineBetterEventHandler(
      { input: { query: z.object({ page: z.string() }) } },
      () => {
        throw tagged
      }
    )

    const { response, thrown } = await requestReporting(
      handler,
      '/api/test?page=1'
    )

    // The undeclared-tag check runs only on routes that declare `errors`.
    expect(response.status).toBe(500)
    expect(thrown.cause).toBe(tagged)
    expect(thrown.message).not.toContain('[better-handler]')
  })
})

describe('a route declaring only errors', () => {
  it('skips validation entirely, so the body is never read', async () => {
    const handler: EventHandler = defineBetterEventHandler(
      { errors: { 'order-locked': { status: 409 } } },
      () => ({ served: true })
    )

    // A body the strict read would refuse: an `errors`-only route never
    // attempts it.
    const response = await request(handler, '/api/test', {
      init: postJson('{ not json at all'),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ served: true })
  })
})
