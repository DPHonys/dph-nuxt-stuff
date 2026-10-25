import {
  createApp,
  createRouter,
  eventHandler,
  getRequestHeaders,
  toWebHandler,
} from 'h3'
import { createFetch } from 'ofetch'
import { afterEach, describe, expect, it } from 'vitest'
import clientPlugin from '../../src/runtime/app/plugins/better-fetch.client'
import { defineBetterEventHandler } from '../../src/runtime/server'
import type { RequestHookHost } from '../../src/runtime/server/event-better-fetch'
import { installEventBetterFetch } from '../../src/runtime/server/event-better-fetch'
import nitroPlugin from '../../src/runtime/server/plugins/better-fetch'
import {
  $betterFetch,
  createBetterFetch,
  installBetterFetchGlobal,
} from '../../src/runtime/shared/better-fetch'

// `$betterFetch` without a Nuxt boot: the factory over a real ofetch instance
// against a real h3 app, so every header below is one the server received
// after ofetch's own merge, and every failure the error ofetch really throws.

const ORIGIN = 'http://test.local'

const orders = defineBetterEventHandler(
  { errors: { 'order-locked': { status: 409 } } },
  (event, { fail }) => {
    if (event.path.endsWith('locked')) throw fail('order-locked')

    return { id: 7 }
  }
)

/** An h3 app answering `/echo` with the headers it received, and `/orders`. */
function server(): (request: Request) => Promise<Response> {
  const router = createRouter()
    .get(
      '/echo',
      eventHandler((event) => getRequestHeaders(event))
    )
    .get('/orders/**', orders)

  return toWebHandler(createApp().use(router))
}

/** A vanilla ofetch instance over the app, as `globalThis.$fetch` is one. */
function vanillaFetch() {
  const web = server()

  return createFetch({
    fetch: (input, init) =>
      web(new Request(new URL(String(input), ORIGIN), init)),
  })
}

/** The headers `/echo` received through a `$betterFetch` over the app. */
async function received<T>(
  call: (better: typeof $betterFetch) => Promise<T>
): Promise<T> {
  return call(createBetterFetch(vanillaFetch()))
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, '$betterFetch')
})

describe('the accept header, on the global', () => {
  // Every row asserts the whole header set the server received, past ofetch.
  it.each([
    ['no headers at all', undefined, { accept: 'application/json' }],
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
    ['the caller’s own accept', { Accept: 'text/csv' }, { accept: 'text/csv' }],
  ])(
    'is added to %s, and never over the caller’s own',
    async (_name, headers, expected) => {
      expect(
        await received((better) =>
          better('/echo', headers === undefined ? {} : { headers })
        )
      ).toEqual(expected)
    }
  )

  it('rides .raw, which resolves the whole response', async () => {
    const response = await createBetterFetch(vanillaFetch()).raw('/echo')

    expect(response.status).toBe(200)
    expect(response._data).toEqual({ accept: 'application/json' })
  })

  it('leaves .native untouched: a bare fetch is not this family’s', async () => {
    const base = vanillaFetch()
    const forwarded: unknown[] = []

    base.native = (...args) => {
      forwarded.push(args)

      return Promise.resolve(new Response('ok'))
    }

    const init = { headers: { authorization: 'Bearer t' } }

    await createBetterFetch(base).native('/echo', init)

    expect(forwarded).toEqual([['/echo', init]])
    expect(init.headers).toEqual({ authorization: 'Bearer t' })
  })
})

describe('the accept header, through create(defaults)', () => {
  it('keeps an instance’s own accept', async () => {
    expect(
      await received((better) =>
        better.create({ headers: { accept: 'text/html' } })('/echo')
      )
    ).toEqual({ accept: 'text/html' })
  })

  it('adds JSON beside an instance’s other headers', async () => {
    expect(
      await received((better) =>
        better.create({ headers: { authorization: 'Bearer t' } })('/echo')
      )
    ).toEqual({ authorization: 'Bearer t', accept: 'application/json' })
  })

  it('follows ofetch’s shallow merge: a later create’s headers replace the earlier ones', async () => {
    expect(
      await received((better) =>
        better
          .create({ headers: { accept: 'text/html' } })
          .create({ headers: { 'x-trace': '7' } })('/echo')
      )
    ).toEqual({ 'x-trace': '7', accept: 'application/json' })
  })

  it('keeps .try on a created instance', async () => {
    const created = createBetterFetch(vanillaFetch()).create({})

    expect(await created.try('/orders/7')).toEqual({
      data: { id: 7 },
      error: undefined,
    })
  })
})

describe('.try on the global', () => {
  it('answers the success arm with the response', async () => {
    expect(await createBetterFetch(vanillaFetch()).try('/orders/7')).toEqual({
      data: { id: 7 },
      error: undefined,
    })
  })

  it('answers a Known error with its Tagged error', async () => {
    expect(
      await createBetterFetch(vanillaFetch()).try('/orders/locked')
    ).toEqual({ data: undefined, error: { _tag: 'order-locked' } })
  })

  it('answers any other failure with the Request-failed variant', async () => {
    const result = await createBetterFetch(vanillaFetch()).try('/nowhere')

    expect(result.data).toBeUndefined()
    expect(result.error).toMatchObject({ _tag: 'request-failed', status: 404 })
  })

  it('answers a network failure with no status, rethrowing nothing', async () => {
    const offline = createBetterFetch(
      createFetch({
        fetch: () => Promise.reject(new TypeError('fetch failed')),
      })
    )

    expect((await offline.try('/orders/7')).error).toMatchObject({
      _tag: 'request-failed',
      status: undefined,
    })
  })

  it('leaves the call itself throwing ofetch’s error', async () => {
    await expect(
      createBetterFetch(vanillaFetch())('/orders/locked')
    ).rejects.toMatchObject({
      statusCode: 409,
      data: { data: { _tag: 'order-locked' } },
    })
  })
})

describe('the one global', () => {
  it('reads globalThis.$fetch when called, not when built', async () => {
    const original = globalThis.$fetch

    try {
      // An ofetch instance is what Nitro and Nuxt install as `$fetch`;
      // Nitro's declaration only adds route typing to it.
      Object.assign(globalThis, { $fetch: vanillaFetch() })

      expect(await $betterFetch('/echo')).toEqual({
        accept: 'application/json',
      })
    } finally {
      globalThis.$fetch = original
    }
  })

  it('is what the installer puts on globalThis, the same object every time', () => {
    installBetterFetchGlobal()

    expect(globalThis.$betterFetch).toBe($betterFetch)
  })

  it('is installed by the client plugin, which is that installer', () => {
    // `#app` is the suite's double here, its `defineNuxtPlugin` the identity.
    expect(clientPlugin).toBe(installBetterFetchGlobal)
  })

  it('is installed by the Nitro plugin, which also hooks every request', () => {
    const hooked: unknown[] = []
    const host: RequestHookHost = {
      hooks: {
        hook: (name, callback) => {
          hooked.push([name, callback])
        },
      },
    }

    nitroPlugin(host)

    expect(globalThis.$betterFetch).toBe($betterFetch)
    expect(hooked).toEqual([['request', installEventBetterFetch]])
  })
})
