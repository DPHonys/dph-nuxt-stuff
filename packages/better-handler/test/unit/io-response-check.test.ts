import {
  request,
  requestReporting,
  untyped,
  wire,
} from '@dphonys/test-utils/h3-app'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { EventHandler } from 'h3'
import { setResponseStatus } from 'h3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineBetterEventHandler } from '../../src/runtime/server'
import { setDevChecks } from '../../src/runtime/server/dev-checks'
import { schemaReturning } from './io-support'

// The development check of a response against its declared `output`, behind
// the one `devChecks` flag the errors half's two checks share. Its gate is
// `import.meta.dev` in a real build, which a plain suite run is neither side
// of, so every case here sets it, through the seam the `devChecks: false`
// option's Nitro plugin writes.

/** Mounted on h3's router, so `event.path` is the path a sentence names. */
const ROUTE = '/api/receipts'

function answer(handler: EventHandler) {
  return requestReporting(handler, ROUTE, { route: ROUTE })
}

const receipt = z.object({ id: z.string(), total: z.number() })
const existing = z.object({ id: z.string() })
const created = z.object({ id: z.string(), createdAt: z.string() })

/** What every refusal here ends with, after its own first sentence. */
const VALUE_ADVICE =
  'Nothing checks the response in production, so this route would send that value as it is: fix the handler or the schema, or set `devChecks: false`.'

beforeEach(() => {
  setDevChecks(true)
})

// Left off the way a production build starts, so a file that forgets to set
// it cannot inherit a development server from this one.
afterEach(() => {
  setDevChecks(false)
})

describe('a development server checking a bare-form response', () => {
  it('refuses a mismatch with a plain 500 naming the route, the status and the issues', async () => {
    const route = defineBetterEventHandler({ output: receipt }, () =>
      wire('{"id":1,"total":"free"}')
    )

    const { response, thrown } = await answer(route)

    expect(response.status).toBe(500)
    // A developer's mistake: no `data`, so nothing reads it as a Known error.
    expect(thrown.data).toBeUndefined()
    expect(thrown.message).toBe(
      `[better-handler] cannot send the response: GET ${ROUTE} answered 200 with a value its declared Response output rejects - id: Invalid input: expected string, received number; total: Invalid input: expected number, received string. ${VALUE_ADVICE}`
    )
  })

  it('checks under 200 whatever status the Handler set', async () => {
    // The status is forced before the check, so the check and the client
    // both see the one status the bare form declares.
    const route = defineBetterEventHandler({ output: receipt }, (event) => {
      setResponseStatus(event, 201)

      return wire('{"id":"r-1"}')
    })

    const { thrown } = await answer(route)

    expect(thrown.message).toContain(`GET ${ROUTE} answered 200 with a value`)
  })

  it('sends the Handler’s own value, never the schema’s parsed output', async () => {
    // The schema strips the extra key and upper-cases the name; the check is
    // an assertion, so neither lands and development sends production's bytes.
    const shouted = z.object({
      name: z.string().transform((name) => name.toUpperCase()),
    })

    const route = defineBetterEventHandler({ output: shouted }, () =>
      wire('{"name":"ada","extra":true}')
    )

    const response = await request(route, ROUTE, { route: ROUTE })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      name: 'ada',
      extra: true,
    })
  })

  it('awaits an async Standard Schema', async () => {
    const asyncSchema: StandardSchemaV1 = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: () =>
          Promise.resolve({ issues: [{ message: 'too late', path: ['id'] }] }),
      },
    }

    const route = defineBetterEventHandler({ output: asyncSchema }, () => ({
      id: '1',
    }))

    const { thrown } = await answer(route)

    // A promise read for `issues` would have looked like every value that
    // passes, and this response would have gone out.
    expect(thrown.statusCode).toBe(500)
    expect(thrown.message).toContain('id: too late')
  })

  it('names the body itself for an issue with no path, and a null-prototype segment by its key', async () => {
    const segment = Object.assign(Object.create(null), { key: 'lines' })
    const route = defineBetterEventHandler(
      {
        output: schemaReturning({
          issues: [
            { message: 'not a receipt' },
            { message: 'too many', path: [segment, 3] },
          ],
        }),
      },
      () => ({})
    )

    const { thrown } = await answer(route)

    expect(thrown.message).toContain(
      'rejects - the response body: not a receipt; lines.3: too many.'
    )
  })

  it('names a rejection that reported no issue at all', async () => {
    const route = defineBetterEventHandler(
      { output: schemaReturning({ issues: [] }) },
      () => ({})
    )

    const { thrown } = await answer(route)

    expect(thrown.message).toContain(
      'rejects - the schema rejected it without saying why.'
    )
  })

  it('answers a schema that throws with a fault keeping what it threw', async () => {
    const broken = new Error('the schema broke')
    const throwing: StandardSchemaV1 = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: () => {
          throw broken
        },
      },
    }

    const route = defineBetterEventHandler({ output: throwing }, () => ({}))

    const { response, thrown } = await answer(route)

    expect(response.status).toBe(500)
    expect(thrown.data).toBeUndefined()
    expect(thrown.cause).toBe(broken)
    expect(thrown.message).toBe(
      `[better-handler] cannot send the response: GET ${ROUTE} answered 200, and the schema its Response output declares threw while checking the value instead of reporting issues - the cause is what it threw. ` +
        'Nothing runs the schema in production, so this route would send the value unchecked: fix the schema, or set `devChecks: false`.'
    )
  })

  it('refuses a mismatch on a route declaring errors too, as no Known error', async () => {
    // The response is checked outside the errors boundary: a refusal of the
    // response is never read as something the Handler threw.
    const route = defineBetterEventHandler(
      { output: receipt, errors: { 'order-locked': { status: 409 } } },
      () => wire('{"id":1}')
    )

    const { response, thrown } = await answer(route)

    expect(response.status).toBe(500)
    expect(thrown.data).toBeUndefined()
    expect(thrown.message).toContain('answered 200 with a value')
  })
})

describe('a development server checking a map-form response', () => {
  it('checks the value against the schema of the status responded with', async () => {
    // `200` would have accepted this value; `201` is what it was sent under.
    const route = defineBetterEventHandler(
      { output: { 200: existing, 201: created } },
      (_event, { respond }) => respond(201, wire('{"id":"1"}'))
    )

    const { response, thrown } = await answer(route)

    expect(response.status).toBe(500)
    expect(thrown.data).toBeUndefined()
    expect(thrown.message).toBe(
      `[better-handler] cannot send the response: GET ${ROUTE} answered 201 with a value its declared Response output rejects - createdAt: Invalid input: expected string, received undefined. ${VALUE_ADVICE}`
    )
  })

  it('lets the value its status declares through untouched', async () => {
    const route = defineBetterEventHandler(
      { output: { 200: existing, 201: created } },
      (_event, { respond }) => respond(200, wire('{"id":"1","extra":true}'))
    )

    const response = await request(route, ROUTE, { route: ROUTE })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ id: '1', extra: true })
  })

  it('has nothing to check under a status declared null, value passed or not', async () => {
    const route = defineBetterEventHandler(
      { output: { 200: existing, 202: null } },
      (_event, { respond }) => untyped(respond)(202, { leaked: true })
    )

    const response = await request(route, ROUTE, { route: ROUTE })

    expect(response.status).toBe(202)
    await expect(response.text()).resolves.toBe('')
  })

  it('refuses a status the map never declared before it reaches the response', async () => {
    // The compile error's answer for a caller the types never saw: `404` is
    // none of `200 | 201`, so no schema is reached, and the status the map
    // never promised is refused rather than sent.
    const route = defineBetterEventHandler(
      { output: { 201: created, 200: existing } },
      (_event, { respond }) => untyped(respond)(404, { id: '1' })
    )

    const { response, thrown } = await answer(route)

    // The client receives the refusal, never the undeclared status.
    expect(response.status).toBe(500)
    expect(thrown.data).toBeUndefined()
    expect(thrown.message).toBe(
      `[better-handler] cannot send the response: GET ${ROUTE} answered 404, a status its declared Response output never names - the map names 200, 201. ` +
        'Nothing checks the response in production, so this route would send that status as it is: respond under one of those, or name 404 in `output`, or set `devChecks: false`.'
    )
  })
})

describe('a server with the check off', () => {
  beforeEach(() => {
    setDevChecks(false)
  })

  it('runs no schema on a bare-form response, and sends an invalid value as it is', async () => {
    const route = defineBetterEventHandler({ output: receipt }, () =>
      wire('{"id":1}')
    )

    const response = await request(route, ROUTE, { route: ROUTE })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ id: 1 })
  })

  it('still answers the bare form under 200', async () => {
    const route = defineBetterEventHandler({ output: receipt }, (event) => {
      setResponseStatus(event, 201)

      return { id: 'r-1', total: 1 }
    })

    const response = await request(route, ROUTE, { route: ROUTE })

    expect(response.status).toBe(200)
  })

  it('runs no schema on a map-form response either', async () => {
    const route = defineBetterEventHandler(
      { output: { 201: receipt } },
      (_event, { respond }) => respond(201, wire('{"id":1}'))
    )

    const response = await request(route, ROUTE, { route: ROUTE })

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({ id: 1 })
  })

  it('sends a status the map never declared, and throws nothing', async () => {
    const route = defineBetterEventHandler(
      { output: { 200: receipt } },
      (_event, { respond }) => untyped(respond)(404, { id: '1' })
    )

    const response = await request(route, ROUTE, { route: ROUTE })

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

    const route = defineBetterEventHandler({ output: watched }, () => ({
      id: 1,
    }))

    await request(route, ROUTE, { route: ROUTE })

    expect(asked).toBe(false)
  })
})
