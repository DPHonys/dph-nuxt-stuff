import type { JsonValue } from '@dphonys/test-utils/json'
import {
  createApp,
  createRouter,
  eventHandler,
  fetchWithEvent,
  getQuery,
  getRequestHeaders,
  readBody,
  toWebHandler,
} from 'h3'
import type { H3Event } from 'h3'
import { createFetch } from 'ofetch'
import type { $Fetch } from 'ofetch'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineBetterEventHandler } from '../../src/runtime/server'
import {
  createEventBetterFetch,
  EventFetchUnavailableError,
  installEventBetterFetch,
} from '../../src/runtime/server/event-better-fetch'
import type {
  EventFetchSlots,
  RawEventFetch,
} from '../../src/runtime/server/event-better-fetch'

// `event.$betterFetch` without a Nuxt boot: a real h3 app whose relaying
// handler gives its event the `$fetch` Nitro gives every event - h3's
// `fetchWithEvent` over the global `$fetch` - and installs the wrapper as the
// `request` hook does. Every header below is one the callee received after
// h3's merge, which spreads the caller's headers over the incoming request's:
// asserting on the value handed to `event.$fetch` would read a `Headers`
// instance, which spreads to nothing, as a pass.

const ORIGIN = 'http://test.local'

/** How a call settled: what it threw, or what it resolved to. */
type Settled<T> =
  | { readonly threw: false; readonly value: T }
  | { readonly threw: true; readonly value: unknown }

/** How a call settled: the pair, so a suite tells a rethrow from an arm. */
async function settled<T>(run: () => Promise<T>): Promise<Settled<T>> {
  try {
    return { threw: false, value: await run() }
  } catch (error) {
    return { threw: true, value: error }
  }
}

/** An event fetch that resolves every request to its own path. */
const echoPath: RawEventFetch<string> = (request) =>
  Promise.resolve(String(request))

/** The options the global `$fetch` underneath takes. */
type VanillaInit = Parameters<$Fetch>[1]

/** What the incoming request carries; h3 forwards all but `accept`. */
const INCOMING = {
  cookie: 'session=abc',
  'user-agent': 'probe',
  accept: 'text/html',
}

/** What h3 forwards of {@link INCOMING} to the callee. */
const FORWARDED = { cookie: 'session=abc', 'user-agent': 'probe' }

const orders = defineBetterEventHandler(
  { errors: { 'order-locked': { status: 409 } } },
  (event, { fail }) => {
    if (event.path.endsWith('locked')) throw fail('order-locked')

    return { id: 7 }
  }
)

/**
 * Send one request to an app whose `/relay` runs `run` with an event carrying
 * Nitro's `event.$fetch` and the installed `event.$betterFetch`, and answer
 * what `run` resolved to. `/echo` answers the headers it received, `/orders`
 * is a route with a Known error.
 */
async function relayed<T>(
  run: (event: H3Event) => Promise<T>
): Promise<JsonValue> {
  // The app is built empty and routed below: the global `$fetch` the relay
  // fetches through answers from the same app.
  const app = createApp()
  const web = toWebHandler(app)
  const vanilla: $Fetch = createFetch({
    fetch: (input, init) =>
      web(new Request(new URL(String(input), ORIGIN), init)),
  })

  const router = createRouter()
    .use(
      '/echo',
      eventHandler(async (event) => ({
        headers: getRequestHeaders(event),
        query: getQuery(event),
        method: event.method,
        body: event.method === 'POST' ? await readBody(event) : undefined,
      }))
    )
    .get('/orders/**', orders)
    .get(
      '/relay',
      eventHandler((event) => {
        // What Nitro's request handling assigns before the `request` hook,
        // assigned through the installer's own view of the event.
        const slots: EventFetchSlots = event

        slots.$fetch = (request: string | Request, init?: RequestInit) =>
          fetchWithEvent(event, request, init, {
            fetch: (input: RequestInfo | URL, opts?: VanillaInit) =>
              vanilla(input instanceof URL ? input.href : input, opts),
          })
        installEventBetterFetch(event)

        return run(event)
      })
    )

  app.use(router)

  const response = await web(
    new Request(`${ORIGIN}/relay`, { headers: INCOMING })
  )

  return z.json().parse(await response.json())
}

describe('the accept header, on the event-bound fetch', () => {
  it.each([
    [
      'a plain object',
      { authorization: 'Bearer t' },
      { authorization: 'Bearer t', accept: 'application/json' },
    ],
    [
      'a Headers instance',
      new Headers({ authorization: 'Bearer t' }),
      { authorization: 'Bearer t', accept: 'application/json' },
    ],
    [
      'a tuple list',
      [
        ['authorization', 'Bearer t'],
        ['x-trace', '7'],
      ] satisfies [string, string][],
      {
        authorization: 'Bearer t',
        'x-trace': '7',
        accept: 'application/json',
      },
    ],
    ['no headers at all', undefined, { accept: 'application/json' }],
    ['the caller’s own accept', { Accept: 'text/csv' }, { accept: 'text/csv' }],
  ])(
    'keeps %s, merged over what h3 forwards',
    async (_name, headers, expected) => {
      const echoed = await relayed((event) =>
        event.$betterFetch('/echo', headers === undefined ? {} : { headers })
      )

      expect(echoed).toMatchObject({ headers: { ...FORWARDED, ...expected } })
    }
  )

  it('lets a caller override a header h3 forwarded', async () => {
    const echoed = await relayed((event) =>
      event.$betterFetch('/echo', { headers: { cookie: 'session=override' } })
    )

    expect(echoed).toMatchObject({
      headers: {
        cookie: 'session=override',
        'user-agent': 'probe',
        accept: 'application/json',
      },
    })
  })

  it('forwards the request and every other option untouched', async () => {
    const echoed = await relayed((event) =>
      event.$betterFetch('/echo', {
        method: 'POST',
        query: { page: 2 },
        body: { title: 't' },
      })
    )

    expect(echoed).toMatchObject({
      method: 'POST',
      query: { page: '2' },
      body: { title: 't' },
    })
  })
})

describe('.try on the event-bound fetch', () => {
  it('answers the success arm with the response', async () => {
    expect(
      await relayed((event) => event.$betterFetch.try('/orders/7'))
    ).toEqual({ data: { id: 7 } })
  })

  it('answers a Known error with its Tagged error', async () => {
    expect(
      await relayed((event) => event.$betterFetch.try('/orders/locked'))
    ).toEqual({ error: { _tag: 'order-locked' } })
  })

  it('answers any other failure with the Request-failed variant', async () => {
    expect(
      await relayed(async (event) => {
        const { error } = await event.$betterFetch.try('/nowhere')

        return error?._tag === 'request-failed'
          ? { tag: error._tag, status: error.status }
          : error
      })
    ).toEqual({ tag: 'request-failed', status: 404 })
  })

  it('applies the same header as the throwing call', async () => {
    expect(
      await relayed((event) =>
        event.$betterFetch.try('/echo', {
          headers: new Headers({ 'x-trace': '7' }),
        })
      )
    ).toMatchObject({
      data: {
        headers: { ...FORWARDED, 'x-trace': '7', accept: 'application/json' },
      },
    })
  })
})

describe('the instance', () => {
  it('is the call and .try, with no member event.$fetch cannot back', () => {
    const better = createEventBetterFetch(() => () => Promise.resolve('ok'))

    expect(Object.keys(better)).toEqual(['try'])
  })

  it('is installed on the event, reading event.$fetch on every call', async () => {
    const slots: EventFetchSlots = {}

    installEventBetterFetch(slots)

    slots.$fetch = echoPath

    expect(await slots.$betterFetch?.('/api/later')).toBe('/api/later')
  })
})

describe('the skew guard: no event.$fetch at runtime', () => {
  it('throws the named error, and nothing is fetched', async () => {
    const result = await settled(() =>
      createEventBetterFetch(() => undefined)('/api/anything')
    )

    expect(result).toEqual({
      threw: true,
      value: expect.any(EventFetchUnavailableError),
    })
    expect(result.value).toMatchObject({
      name: 'EventFetchUnavailableError',
      message:
        '[better-handler] event.$betterFetch cannot run: this event has no `event.$fetch`. @dphonys/better-handler wraps Nitro’s experimental `event.$fetch`, and the installed Nitro or h3 no longer provides it, so the runtime is newer than the versions this package supports. Upgrade @dphonys/better-handler, or pin Nitro and h3 to a supported version.',
    })
  })

  it('throws through .try rather than answering the failure arm', async () => {
    // Skew is not a failed request: classified, it would read as one.
    const result = await settled(() =>
      createEventBetterFetch(() => undefined).try('/api/anything')
    )

    expect(result).toEqual({
      threw: true,
      value: expect.any(EventFetchUnavailableError),
    })
  })

  // A promise-returning API that throws synchronously escapes a caller's
  // `.catch` and `.then(onRejected)`: both report the skew by rejecting.
  it('rejects rather than throwing while the call is made', async () => {
    const better = createEventBetterFetch(() => undefined)
    let pending: Promise<unknown> | undefined

    expect(() => {
      pending = better('/api/anything')
    }).not.toThrow()
    await expect(pending).rejects.toBeInstanceOf(EventFetchUnavailableError)
  })

  it('rejects .try rather than throwing while the call is made', async () => {
    const better = createEventBetterFetch(() => undefined)
    let pending: Promise<unknown> | undefined

    expect(() => {
      pending = better.try('/api/anything')
    }).not.toThrow()
    await expect(pending).rejects.toBeInstanceOf(EventFetchUnavailableError)
  })

  it('rejects a later loss rather than throwing it, past the check', async () => {
    let base: RawEventFetch<string> | undefined = echoPath
    const better = createEventBetterFetch(() => base)

    await better('/api/anything')

    base = undefined

    let pending: Promise<unknown> | undefined

    expect(() => {
      pending = better.try('/api/anything')
    }).not.toThrow()
    await expect(pending).rejects.toBeInstanceOf(TypeError)
  })

  it('reads event.$fetch once per .try call', async () => {
    let reads = 0
    const better = createEventBetterFetch(() => {
      reads += 1

      return echoPath
    })

    expect(await better.try('/api/anything')).toEqual({
      data: '/api/anything',
      error: undefined,
    })
    expect(reads).toBe(1)
  })

  it('checks once: a verified wrapper reports a later loss as h3 would', async () => {
    let base: RawEventFetch<string> | undefined = echoPath
    const better = createEventBetterFetch(() => base)

    await better('/api/anything')

    base = undefined

    const result = await settled(() => better('/api/anything'))

    expect(result).toEqual({ threw: true, value: expect.any(TypeError) })
    expect(result.value).not.toBeInstanceOf(EventFetchUnavailableError)
  })
})
