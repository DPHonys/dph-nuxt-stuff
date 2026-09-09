import type { StandardSchemaV1 } from '@standard-schema/spec'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineValidatedEventHandler } from '../../src/runtime/server'
import { setResponseChecking } from '../../src/runtime/server/lib/response-check'
import {
  request,
  requestReporting,
  schemaReturning,
  untyped,
  wire,
} from '../h3-app'

// The dev-only check of a response against its declared Response output. The
// gate is `import.meta.dev` in a real build, which a plain suite run is neither
// side of, so every case here sets it explicitly - the same seam the
// `checkResponses: false` module option's Nitro plugin writes.

/** Mounted on h3's router, so `event.path` is the path the message names. */
const ROUTE = '/api/receipts'

beforeEach(() => {
  setResponseChecking(true)
})

// Left off the way a production build starts, so a file that forgets to set it
// cannot inherit a development server from this one.
afterEach(() => {
  setResponseChecking(false)
})

describe('a development server checking a bare-form response', () => {
  const receipt = z.object({ id: z.string(), total: z.number() })

  it('answers a mismatch with a 500 naming the route, the status and the issues', async () => {
    const handler = defineValidatedEventHandler({ output: receipt }, () =>
      wire('{"id":1,"total":"free"}')
    )

    const { response, thrown } = await requestReporting(handler, ROUTE, {
      route: ROUTE,
    })

    expect(response.status).toBe(500)
    expect(thrown.message).toContain(`GET ${ROUTE}`)
    expect(thrown.message).toContain('answered 200')
    expect(thrown.message).toContain('id: ')
    expect(thrown.message).toContain('total: ')
  })

  it('raises no Known-error tag and no validation marker with it', async () => {
    // A plain `500`: the Known-error union of a route never widens with an arm
    // production cannot produce, and a hook that skips validation failures
    // still reports this one.
    const handler = defineValidatedEventHandler({ output: receipt }, () =>
      wire('{"id":1,"total":1}')
    )

    const { thrown } = await requestReporting(handler, ROUTE, { route: ROUTE })

    expect(thrown.statusCode).toBe(500)
    expect(thrown.data).toBeUndefined()
  })

  it('sends the handler’s own value, never the schema’s parsed output', async () => {
    // The schema strips the extra key and upper-cases the name; the check is an
    // assertion, so neither lands and development sends production's bytes.
    const shouted = z.object({
      name: z.string().transform((name) => name.toUpperCase()),
    })

    const handler = defineValidatedEventHandler({ output: shouted }, () =>
      wire('{"name":"ada","extra":true}')
    )

    const response = await request(handler, ROUTE, { route: ROUTE })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      name: 'ada',
      extra: true,
    })
  })

  it('awaits an async Standard Schema result', async () => {
    // `schemaReturning` hands back a settled result; the whole point here is
    // the promise, so this one is spelled out.
    const asyncSchema: StandardSchemaV1 = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: () =>
          Promise.resolve({ issues: [{ message: 'too late', path: ['id'] }] }),
      },
    }

    const handler = defineValidatedEventHandler({ output: asyncSchema }, () =>
      wire('{"id":"1"}')
    )

    const { thrown } = await requestReporting(handler, ROUTE, { route: ROUTE })

    // A promise read for `issues` would have looked like every value that
    // passes, and this response would have gone out.
    expect(thrown.statusCode).toBe(500)
    expect(thrown.message).toContain('id: too late')
  })

  it('names the body itself when an issue carries no path', async () => {
    const rootIssue = schemaReturning({ issues: [{ message: 'not a list' }] })

    const handler = defineValidatedEventHandler({ output: rootIssue }, () =>
      wire('{}')
    )

    const { thrown } = await requestReporting(handler, ROUTE, { route: ROUTE })

    expect(thrown.message).toContain('the response body: not a list')
  })
})

describe('a development server checking a map-form response', () => {
  const existing = z.object({ id: z.string() })
  const created = z.object({ id: z.string(), createdAt: z.string() })

  it('checks the value against the schema of the status responded with', async () => {
    const handler = defineValidatedEventHandler(
      { output: { 200: existing, 201: created } },
      (_event, { respond }) => respond(201, wire('{"id":"1"}'))
    )

    const { thrown } = await requestReporting(handler, ROUTE, { route: ROUTE })

    // `200` would have accepted this value; `201` is the status it was sent
    // under, and the check reads the map at that status alone.
    expect(thrown.statusCode).toBe(500)
    expect(thrown.message).toContain('answered 201')
    expect(thrown.message).toContain('createdAt: ')
  })

  it('lets the value the responded status promised through untouched', async () => {
    const handler = defineValidatedEventHandler(
      { output: { 200: existing, 201: created } },
      (_event, { respond }) => respond(200, wire('{"id":"1","extra":true}'))
    )

    const response = await request(handler, ROUTE, { route: ROUTE })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ id: '1', extra: true })
  })

  it('has nothing to check on a status declared `null`', async () => {
    const handler = defineValidatedEventHandler(
      { output: { 204: null } },
      (_event, { respond }) => respond(204)
    )

    const response = await request(handler, ROUTE, { route: ROUTE })

    expect(response.status).toBe(204)
    await expect(response.text()).resolves.toBe('')
  })

  it('refuses a status the map never declared, naming the ones it did', async () => {
    // The compile error's answer for a caller the types never saw: `404` is
    // not one of `200 | 201`, so no schema is reached and the status the map
    // never promised is refused rather than sent.
    const handler = defineValidatedEventHandler(
      { output: { 200: existing, 201: created } },
      (_event, { respond }) => untyped(respond)(404, { id: '1' })
    )

    const { response, thrown } = await requestReporting(handler, ROUTE, {
      route: ROUTE,
    })

    // The client receives the refusal, never the undeclared status.
    expect(response.status).toBe(500)
    expect(thrown.statusCode).toBe(500)
    expect(thrown.message).toContain(`GET ${ROUTE}`)
    expect(thrown.message).toContain('answered 404')
    expect(thrown.message).toContain('200, 201')
    // A plain `500` like every other mismatch here: no Known-error tag, no
    // validation marker.
    expect(thrown.data).toBeUndefined()
  })
})

describe('a server with the check off', () => {
  const receipt = z.object({ id: z.string() })

  beforeEach(() => {
    setResponseChecking(false)
  })

  it('runs no schema, and sends an invalid value as it is', async () => {
    // The schema would have rejected this and thrown; nothing runs it, so the
    // route answers exactly as a production build would.
    const handler = defineValidatedEventHandler({ output: receipt }, () =>
      wire('{"id":1}')
    )

    const response = await request(handler, ROUTE, { route: ROUTE })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ id: 1 })
  })

  it('runs no schema on a map-form response either', async () => {
    const handler = defineValidatedEventHandler(
      { output: { 201: receipt } },
      (_event, { respond }) => respond(201, wire('{"id":1}'))
    )

    const response = await request(handler, ROUTE, { route: ROUTE })

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({ id: 1 })
  })

  it('sends a status the map never declared, and throws nothing', async () => {
    // The other half of the check being off: with it on this is a `500`, and
    // production has never refused it at all.
    const handler = defineValidatedEventHandler(
      { output: { 200: receipt } },
      (_event, { respond }) => untyped(respond)(404, { id: '1' })
    )

    const response = await request(handler, ROUTE, { route: ROUTE })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ id: '1' })
  })

  it('never even asks the schema', async () => {
    let asked = false
    const watched: StandardSchemaV1 = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: () => {
          asked = true

          return { value: undefined }
        },
      },
    }

    const handler = defineValidatedEventHandler({ output: watched }, () =>
      wire('{"id":1}')
    )

    await request(handler, ROUTE, { route: ROUTE })

    expect(asked).toBe(false)
  })
})
