import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { EventHandler } from 'h3'
import { createApp, createRouter, toWebHandler } from 'h3'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineValidatedEventHandler } from '../../src/runtime/server'
import type { ValidationSource } from '../../src/runtime/types'

/**
 * The primary seam: a handler built by `defineValidatedEventHandler`, mounted
 * in a real h3 app and driven by real requests. Half of this package's
 * decisions are claims about h3's own behaviour, so the app is h3's, never a
 * double of it - and every assertion is about what a request got back or what
 * the handler body was handed, never about an internal shape.
 */

/**
 * Mount one handler and send it a request. `debug` is h3's own verbose-errors
 * switch - the knob a Nitro dev build turns on, and the only thing in the tree
 * that could make a failure body differ between development and production.
 *
 * `route` mounts the handler on h3's own router instead of the plain prefix,
 * which is the only way to get real route params: `event.context.params` is
 * filled by the router's match, and every claim this suite makes about params
 * - decoding, catch-all joining, the anonymous key - is a claim about that
 * matcher, so it has to be h3's.
 */
function request(
  handler: EventHandler,
  path: string,
  options: { init?: RequestInit; debug?: boolean; route?: string } = {}
): Promise<Response> {
  const app = createApp({ debug: options.debug ?? false })

  if (options.route === undefined) {
    app.use('/api/test', handler)
  } else {
    app.use(createRouter().use(options.route, handler))
  }

  return toWebHandler(app)(
    new Request(`http://test.local${path}`, options.init)
  )
}

/**
 * A POST carrying an already-serialized JSON payload, so a test can send a
 * malformed one as easily as a valid one.
 */
function postJson(
  payload: string,
  headers: Record<string, string> = {}
): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: payload,
  }
}

/**
 * A schema that hands back one fixed result - the door to the shapes the
 * Standard Schema interface permits but no library in the tree produces.
 */
function schemaReturning(
  result: StandardSchemaV1.Result<unknown>
): StandardSchemaV1 {
  return {
    '~standard': { version: 1, vendor: 'test', validate: () => result },
  }
}

/**
 * Which sources a failure answer names - deduplicated, so a response naming
 * two would show up as two.
 */
async function sourcesOfIssues(response: Response): Promise<string[]> {
  const body = (await response.json()) as {
    data: { issues: Array<{ source: string }> }
  }

  return [...new Set(body.data.issues.map((issue) => issue.source))]
}

describe('a handler declaring a routerParams schema', () => {
  it('hands the body the schema output, coercions applied', async () => {
    const handler = defineValidatedEventHandler(
      { routerParams: z.object({ id: z.coerce.number() }) },
      (event, { routerParams }) => ({
        id: routerParams.id,
        type: typeof routerParams.id,
      })
    )

    const response = await request(handler, '/users/42', {
      route: '/users/:id',
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ id: 42, type: 'number' })
  })

  it('validates decoded params, not percent-escapes', async () => {
    const handler = defineValidatedEventHandler(
      { routerParams: z.object({ id: z.string() }) },
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
      { routerParams: z.object({ _: z.string() }) },
      (event, { routerParams }) => ({ rest: routerParams._ })
    )

    const response = await request(handler, '/files/a/b%20c/d.txt', {
      route: '/files/**',
    })

    // h3's matcher decides this shape: one anonymous key, the remaining
    // segments joined with slashes, decoded. The package adds nothing.
    await expect(response.json()).resolves.toEqual({ rest: 'a/b c/d.txt' })
  })

  it('answers 400 tagged `routerParams` when the params fail', async () => {
    const handler = defineValidatedEventHandler(
      { routerParams: z.object({ id: z.coerce.number() }) },
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
      { query: z.object({ page: z.coerce.number() }) },
      (event, { query }) => ({ page: query.page, type: typeof query.page })
    )

    const response = await request(handler, '/api/test?page=2')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      page: 2,
      type: 'number',
    })
  })

  it('delivers query as h3 yields it: strings, arrays for repeated keys', async () => {
    const handler = defineValidatedEventHandler(
      { query: z.object({ tag: z.array(z.string()), page: z.string() }) },
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
      { query: z.object({ page: z.coerce.number() }) },
      () => {
        bodyRan = true
        return 'the body never runs'
      }
    )

    const response = await request(handler, '/api/test?page=not-a-number')
    const body = (await response.json()) as Record<string, unknown>

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
        query: z.object({ page: z.coerce.number(), sort: z.enum(['asc']) }),
      },
      () => 'the body never runs'
    )

    const response = await request(handler, '/api/test?page=x&sort=sideways')
    const body = (await response.json()) as {
      data: { issues: Array<{ source: string; path: unknown[] }> }
    }

    // The library aggregates within a source, so a form with two bad fields
    // reports two issues in one answer - each still tagged with its source.
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
      { query: z.object({ page: z.coerce.number() }) },
      () => 'the body never runs'
    )

    const quiet = await request(handler, '/api/test?page=x')
    const verbose = await request(handler, '/api/test?page=x', { debug: true })

    const quietBody = (await quiet.json()) as Record<string, unknown>
    const verboseBody = (await verbose.json()) as Record<string, unknown>

    // The stack the verbose server adds is h3's; the payload this package
    // raises has no environment branch and no redaction option, so it is the
    // same object under both. The failing shape here would be a payload that
    // says more in development than a client can rely on in production.
    expect(verbose.status).toBe(quiet.status)
    expect(verboseBody.statusMessage).toBe(quietBody.statusMessage)
    expect(verboseBody.data).toEqual(quietBody.data)
  })
})

describe('a handler declaring a headers schema', () => {
  it('delivers headers as h3 does: lowercase keys, multi-values joined', async () => {
    const handler = defineValidatedEventHandler(
      { headers: z.object({ 'x-trace': z.string() }) },
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
      { headers: z.object({ 'X-Trace': z.string() }) },
      () => 'the body never runs'
    )

    const response = await request(handler, '/api/test', {
      init: { headers: { 'X-Trace': 'sent-in-mixed-case' } },
    })

    // The schema names the header the way the client sent it, and misses -
    // h3 lowercases, and this package adds no lookup magic on top.
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
        body: z.object({
          name: z.string(),
          tags: z.string().transform((tags) => tags.split(',')),
        }),
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
      { body: z.object({ name: z.string() }) },
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
})

describe('any Standard Schema', () => {
  it('validates with valibot exactly as with zod', async () => {
    const handler = defineValidatedEventHandler(
      { query: v.object({ page: v.pipe(v.string(), v.transform(Number)) }) },
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
        query: v.pipeAsync(
          v.objectAsync({ page: v.string() }),
          v.checkAsync(async ({ page }) => page !== 'nope')
        ),
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
    const valueless = {
      issues: undefined,
    } as unknown as StandardSchemaV1.Result<undefined>

    const handler = defineValidatedEventHandler(
      { query: schemaReturning(valueless) },
      (event, { query }) => ({ received: query, type: typeof query })
    )

    const response = await request(handler, '/api/test')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ type: 'undefined' })
  })

  it('lets a throwing `validate` be a 500, not a validation failure', async () => {
    const handler = defineValidatedEventHandler(
      {
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
      routerParams: z.object({ id: z.coerce.number() }),
      query: z.object({ page: z.coerce.number() }),
      headers: z.object({ 'x-trace': z.string() }),
      body: z.object({ name: z.string() }),
    },
    (event, { routerParams, query, headers, body }) => ({
      id: routerParams.id,
      page: query.page,
      trace: headers['x-trace'],
      name: body.name,
    })
  )

  /**
   * One request shape, spoiled in exactly the sources named. Every source is
   * declared on the handler, so what changes between calls is only which of
   * them the request satisfies.
   */
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
    // Each request is worse than the last only in the sources *after* the one
    // it fails on, so the source named in the answer is the order itself:
    // routerParams -> query -> headers -> body.
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
        query: z.object({ page: z.coerce.number() }),
        body: z.object({ name: z.string() }),
      },
      () => 'the body never runs'
    )

    const response = await request(handler, '/api/test?page=nope', {
      init: postJson('{ not json at all'),
    })

    // The payload is unparseable, so a body read would have thrown h3's own
    // error instead - the answer being this package's query failure is the
    // proof that the stream was never touched.
    expect(response.status).toBe(400)
    expect(response.statusText).toBe('Validation Error')
    await expect(response.json()).resolves.toMatchObject({
      data: { issues: [{ source: 'query', path: ['page'] }] },
    })
  })
})

describe('the projected issues', () => {
  it('copy nothing across but the message and a normalized path', async () => {
    const secret = Symbol('secret')

    // What a vendor hangs off an issue: valibot's path items carry the raw
    // request input, and none of the extras are JSON-safe. Every path form the
    // interface permits sits in one issue - an object segment, a number, and a
    // symbol.
    const vendorIssue = {
      message: 'Expected a number',
      path: [{ key: 'user' }, 0, secret],
      input: { password: 'hunter2' },
      expected: 'number',
    }

    const handler = defineValidatedEventHandler(
      {
        query: schemaReturning({
          issues: [vendorIssue, { message: 'A pathless issue' }],
        }),
      },
      () => 'the body never runs'
    )

    const response = await request(handler, '/api/test')
    const body = (await response.json()) as { data: { issues: unknown[] } }

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
})
