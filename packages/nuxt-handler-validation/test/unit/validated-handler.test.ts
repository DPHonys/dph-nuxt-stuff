import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { EventHandler } from 'h3'
import { createApp, toWebHandler } from 'h3'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineValidatedEventHandler } from '../../src/runtime/server'

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
 */
function request(
  handler: EventHandler,
  path: string,
  options: { init?: RequestInit; debug?: boolean } = {}
): Promise<Response> {
  const app = createApp({ debug: options.debug ?? false })
  app.use('/api/test', handler)

  return toWebHandler(app)(
    new Request(`http://test.local${path}`, options.init)
  )
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
    const body = (await response.json()) as { data: { issues: unknown[] } }

    expect(body.data.issues).toHaveLength(2)
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
