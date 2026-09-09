import { defineError } from '@dphonys/nuxt-handler-errors/server'
import { setResponseChecking } from '@dphonys/nuxt-handler-validation/internals/server'
import { request, requestReporting, wire } from '@dphonys/test-utils/h3-app'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineTypedEventHandler } from '../../src/runtime/server'

// The validation parent's dev-only response check, reached through this
// module's wrapper: the flag, the schema run and the message are all the
// parent's, so what is asserted here is that the umbrella runs them at all.

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

describe('a development server checking an umbrella route’s response', () => {
  const receipt = z.object({ id: z.string() })

  it('answers a bare-form mismatch with the parent’s 500', async () => {
    const handler = defineTypedEventHandler({ output: receipt }, () =>
      wire('{"id":1}')
    )

    const { response, thrown } = await requestReporting(handler, ROUTE, {
      route: ROUTE,
    })

    expect(response.status).toBe(500)
    expect(thrown.message).toContain(
      '[nuxt-handler-validation] cannot send the response'
    )
    expect(thrown.message).toContain(`GET ${ROUTE}`)
    expect(thrown.message).toContain('answered 200')
    expect(thrown.message).toContain('id: ')
  })

  it('checks a map-form response against the status responded with', async () => {
    const handler = defineTypedEventHandler(
      { output: { 200: receipt, 201: z.object({ id: z.number() }) } },
      (_event, { respond }) => respond(201, wire('{"id":"1"}'))
    )

    const { thrown } = await requestReporting(handler, ROUTE, { route: ROUTE })

    expect(thrown.statusCode).toBe(500)
    expect(thrown.message).toContain('answered 201')
  })

  it('carries no Known-error tag, so a route’s error union never widens', async () => {
    // Declared errors and a Response output together: the mismatch is still a
    // plain `500`, not an arm the route's call sites could match on.
    const handler = defineTypedEventHandler(
      {
        errors: [defineError('user-not-found', { status: 404 })],
        output: receipt,
      },
      () => wire('{"id":1}')
    )

    const { thrown } = await requestReporting(handler, ROUTE, { route: ROUTE })

    expect(thrown.statusCode).toBe(500)
    expect(thrown.data).toBeUndefined()
  })

  it('sends what the handler handed over, never the schema’s output', async () => {
    const shouted = z.object({
      name: z.string().transform((name) => name.toUpperCase()),
    })

    const handler = defineTypedEventHandler({ output: shouted }, () =>
      wire('{"name":"ada","extra":true}')
    )

    const response = await request(handler, ROUTE, { route: ROUTE })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      name: 'ada',
      extra: true,
    })
  })
})

describe('an umbrella route with the check off', () => {
  beforeEach(() => {
    setResponseChecking(false)
  })

  it('runs no schema, and sends an invalid value as it is', async () => {
    const handler = defineTypedEventHandler(
      { output: z.object({ id: z.string() }) },
      () => wire('{"id":1}')
    )

    const response = await request(handler, ROUTE, { route: ROUTE })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ id: 1 })
  })
})

describe('an umbrella `output` that names no reply', () => {
  it('is refused at route evaluation, in the parent’s sentence', () => {
    expect(() =>
      defineTypedEventHandler(wire('{"output":{}}'), () => null)
    ).toThrow(
      '[nuxt-handler-validation] cannot declare the Response output: an empty object names no reply'
    )
  })
})
