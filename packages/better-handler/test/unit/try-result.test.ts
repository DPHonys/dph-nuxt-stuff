import { untyped } from '@dphonys/test-utils/h3-app'
import { createApp, createError, eventHandler, toWebHandler } from 'h3'
import type { EventHandler } from 'h3'
import { createFetch } from 'ofetch'
import { describe, expect, it } from 'vitest'
import { defineBetterEventHandler } from '../../src/runtime/server'
import { developerFault } from '../../src/runtime/server/faults'
import { toTryResult } from '../../src/runtime/shared/errors/try-result'
import { toNuxtError } from '../../src/runtime/shared/h3'

// What `.try` is built on, without a Nuxt boot: a real ofetch call against a
// real h3 app, so every failure below is the error ofetch really throws. The
// h3 app's error body is Nitro's without `error` and `url`; the Tagged error
// sits under `data` in both.

/** ofetch over one mounted handler, answering at `http://test.local/api/test`. */
function fetchFrom(handler: EventHandler) {
  const app = createApp()
  app.use('/api/test', handler)
  const web = toWebHandler(app)

  return createFetch({
    // As a real `fetch` does, an aborted signal rejects before any request.
    fetch: async (input, init) => {
      init?.signal?.throwIfAborted()

      return web(new Request(new URL(String(input), 'http://test.local'), init))
    },
  })
}

const orders = defineBetterEventHandler(
  {
    errors: {
      'order-not-found': { status: 404 },
      'order-locked': { status: 409 },
    },
  },
  (event, { fail }) => {
    if (event.path.endsWith('locked')) throw fail('order-locked')

    return { id: 7 }
  }
)

describe('toTryResult', () => {
  it('answers the success arm with the resolved value', async () => {
    const result = await toTryResult(() => fetchFrom(orders)('/api/test'))

    expect(result).toEqual({ data: { id: 7 }, error: undefined })
    // The arm really carries the key: `'error' in result` discriminates.
    expect('error' in result).toBe(true)
  })

  it('answers a Known error with its Tagged error, the body’s own object', async () => {
    const result = await toTryResult(() =>
      fetchFrom(orders)('/api/test/locked')
    )

    expect(result).toEqual({ data: undefined, error: { _tag: 'order-locked' } })
  })

  it('hands the Tagged error back itself, not a copy', async () => {
    const body = { statusCode: 404, data: { _tag: 'order-not-found', id: 7 } }
    const result = await toTryResult(() =>
      Promise.reject(
        Object.assign(new Error('order-not-found'), { data: body })
      )
    )

    expect(result.error).toBe(body.data)
  })

  it.each([
    [
      'a status nobody declared',
      eventHandler(() => {
        throw createError({ statusCode: 503, message: 'down' })
      }),
      503,
    ],
    [
      'a developer fault',
      eventHandler(() => {
        throw developerFault('a mistake')
      }),
      500,
    ],
    [
      'a body that is not a Tagged error',
      eventHandler((event) => {
        event.node.res.statusCode = 502
        return '<html>bad gateway</html>'
      }),
      502,
    ],
    [
      'a data whose _tag is not a string',
      eventHandler(() => {
        throw createError({ statusCode: 400, data: { _tag: 7 } })
      }),
      400,
    ],
  ])(
    'answers %s with the Request-failed variant and its status',
    async (_, handler, status) => {
      const result = await toTryResult(() => fetchFrom(handler)('/api/test'))

      expect(result.data).toBeUndefined()
      expect(result.error).toMatchObject({ _tag: 'request-failed', status })
      expect(
        result.error?._tag === 'request-failed' && result.error.cause
      ).toMatchObject({
        statusCode: status,
        status,
      })
    }
  )

  it('answers a network failure with no status', async () => {
    const offline = createFetch({
      fetch: () => Promise.reject(new TypeError('fetch failed')),
    })

    const result = await toTryResult(() =>
      offline('http://test.local/api/test')
    )

    expect(result.error).toMatchObject({
      _tag: 'request-failed',
      status: undefined,
    })
    expect(
      result.error?._tag === 'request-failed' && result.error.cause
    ).toBeInstanceOf(Error)
  })

  it('answers an abort with no status', async () => {
    const controller = new AbortController()
    controller.abort()

    const result = await toTryResult(() =>
      fetchFrom(orders)('/api/test', { signal: controller.signal })
    )

    expect(result.error).toMatchObject({
      _tag: 'request-failed',
      status: undefined,
    })
  })

  it.each([
    ['a thrown null', null],
    ['a thrown string', 'not an object'],
    ['an Error no response came with', new Error('boom')],
    // Only a fetched body says which Known error a failure is.
    ['a Tagged error thrown as-is', { _tag: 'order-locked' }],
  ])(
    'answers %s with the Request-failed variant, rethrowing nothing',
    async (_, cause) => {
      const result = await toTryResult(() => Promise.reject(cause))

      expect(result).toEqual({
        data: undefined,
        error: {
          _tag: 'request-failed',
          status: undefined,
          cause: expect.any(Error),
        },
      })
    }
  )
})

// `status` is read untyped: it is `NuxtError`'s from Nuxt 4.6, and every Nuxt
// 4 runs these, so the getter is asserted at runtime only.
describe('toNuxtError', () => {
  it.each([
    ['a network error', new TypeError('fetch failed')],
    ['an abort', new DOMException('The operation was aborted.', 'AbortError')],
    ['a plain Error', new Error('boom')],
    ['a thrown string', 'not an object'],
    ['a thrown number', 7],
    ['a thrown null', null],
    ['a thrown undefined', undefined],
    ['a thrown array', ['tag', 'status']],
    ['an object with nothing on it', {}],
  ])('normalises %s to an error carrying a status', (_, cause) => {
    const error = toNuxtError(cause)

    expect(error).toBeInstanceOf(Error)
    expect(untyped(error).status).toBeTypeOf('number')
    expect(untyped(error).status).toBe(error.statusCode)
  })

  it('keeps a fetched failure’s body as its data, the Tagged error inside', async () => {
    const thrown = await fetchFrom(orders)('/api/test/locked').catch(
      (cause: Error) => cause
    )
    const error = toNuxtError(thrown)

    expect(untyped(error).status).toBe(409)
    expect(error.data).toMatchObject({ data: { _tag: 'order-locked' } })
  })

  it('returns an error h3 already made, as it is', () => {
    const raised = createError({ statusCode: 403, message: 'forbidden' })

    expect(toNuxtError(raised)).toBe(raised)
    expect(untyped(toNuxtError(raised)).status).toBe(403)
  })

  it('does not overwrite a status the error already has', () => {
    const hydrated = Object.assign(createError({ statusCode: 500 }), {
      status: 418,
    })

    expect(untyped(toNuxtError(hydrated)).status).toBe(418)
  })
})
