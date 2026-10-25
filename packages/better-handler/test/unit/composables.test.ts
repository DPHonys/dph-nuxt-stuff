import {
  asyncDataCalls,
  calls,
  setRequestEvent,
  useAsyncData,
  useFetch,
} from '@dphonys/test-utils/doubles/nuxt-app'
import { createError, isError } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref, toValue } from 'vue'
import type { NuxtApp } from '#app'
import {
  useBetterAsyncData,
  useLazyBetterAsyncData,
  wrapRawAsyncData,
} from '../../src/runtime/app/composables/use-better-async-data'
import {
  useBetterFetch,
  useLazyBetterFetch,
  wrapVanillaFetch,
} from '../../src/runtime/app/composables/use-better-fetch'
import { useRequestBetterFetch } from '../../src/runtime/app/composables/use-request-better-fetch'
import { createEventBetterFetch } from '../../src/runtime/server/event-better-fetch'
import { $betterFetch } from '../../src/runtime/shared/better-fetch'
import { classifyFailure } from '../../src/runtime/shared/errors/try-result'
import { isFunction } from '../../src/runtime/shared/guards'
import type { RequestFailed, TaggedError } from '../../src/runtime/types'

// The composables without a Nuxt boot: `#app` is the shared double, which
// records what each wrapper handed vanilla and simulates nothing. Running
// them for real, through a server-side render, is the wire suite's.

afterEach(() => {
  calls.length = 0
  asyncDataCalls.length = 0
  setRequestEvent(undefined)
})

/** A header list, the form a caller cannot pass refs inside. */
const PAIRS: [string, string][] = [['authorization', 'Bearer t']]

/** An option function, identified by reference. */
function identity<T>(value: T): T {
  return value
}

/** The headers the last `useFetch` call was handed, as vanilla reads them. */
function lastHeaders() {
  return toValue(calls.at(-1)?.opts?.headers)
}

describe('useBetterFetch and its lazy twin', () => {
  it.each([
    ['useBetterFetch', useBetterFetch, 'useFetch'],
    ['useLazyBetterFetch', useLazyBetterFetch, 'useLazyFetch'],
  ] as const)(
    '%s delegates to vanilla’s %s, and is named for the call',
    (name, composable, vanilla) => {
      composable('/api/anything')

      expect(calls.map((call) => call.name)).toEqual([vanilla])
      expect(composable.name).toBe(name)
    }
  )

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
      'a list of pairs',
      PAIRS,
      { authorization: 'Bearer t', accept: 'application/json' },
    ],
    [
      'refs inside a plain object',
      { authorization: ref('Bearer t') },
      { authorization: 'Bearer t', accept: 'application/json' },
    ],
    [
      'a getter for the whole option',
      () => ({ authorization: 'Bearer t' }),
      { authorization: 'Bearer t', accept: 'application/json' },
    ],
    [
      'the caller’s own accept, in any case',
      { Accept: 'text/csv' },
      { accept: 'text/csv' },
    ],
  ])('sends a JSON accept beside %s', (_name, headers, sent) => {
    // Absent rather than `undefined` when not passed, as a caller writes it.
    useBetterFetch('/api/anything', headers === undefined ? {} : { headers })

    // Flattened to a plain object: `fetchWithEvent` spreads it.
    expect(lastHeaders()).toEqual(sent)
  })

  it('keeps tracking the caller’s refs', async () => {
    const authorization = ref('Bearer one')

    useBetterFetch('/api/anything', { headers: { authorization } })
    const headers = calls.at(-1)?.opts?.headers

    authorization.value = 'Bearer two'
    await nextTick()

    expect(toValue(headers)).toEqual({
      authorization: 'Bearer two',
      accept: 'application/json',
    })
  })

  it('forwards the request and every other option untouched', () => {
    const query = { page: 2 }
    useBetterFetch('/api/anything', {
      method: 'POST',
      query,
      transform: identity,
    })

    const last = calls.at(-1)

    expect(last?.request).toBe('/api/anything')
    expect(last?.opts?.method).toBe('POST')
    expect(last?.opts?.query).toBe(query)
    expect(last?.opts?.transform).toBe(identity)
  })

  // What `optimization.keyedComposables` makes of a call: the key after the
  // last argument the call passed, which no typed overload declares, so the
  // raw wrapper, vanilla's own signature, is what takes it.
  it.each([
    [
      'in place of the options',
      () => wrapVanillaFetch(useFetch)('/api/anything', '$key'),
    ],
    [
      'after the options',
      () => wrapVanillaFetch(useFetch)('/api/anything', {}, '$key'),
    ],
  ])('hands vanilla a key the compiler appended %s, last', (_name, call) => {
    call()

    expect(calls.at(-1)?.autoKey).toBe('$key')
    expect(lastHeaders()).toEqual({ accept: 'application/json' })
  })
})

// A fetched failure as h3 normalises it: the whole Nitro error body is its
// `data`, the route's Tagged error one level further down.
function fetchedKnownError(tagged: TaggedError) {
  return createError({
    statusCode: 409,
    message: tagged._tag,
    data: {
      error: true,
      url: '/api/orders/7',
      statusCode: 409,
      statusMessage: '',
      message: tagged._tag,
      data: tagged,
    },
  })
}

interface Order {
  id: number
}

const order: Order = { id: 7 }

// SAFETY: the substituted handler forwards its arguments to the caller's
// handler untouched and reads nothing off them; a bare object stands in for
// the app, and identity is all this suite asserts about it.
const nuxtApp = {} as NuxtApp

// What Nuxt 4.6 hands a handler beside the app; Nuxt 4.0 hands the app alone.
const context = { signal: new AbortController().signal }

/** A handler as the wrapper substituted it, called the way vanilla calls it. */
type Substituted = (...args: readonly unknown[]) => Promise<Order>

// The substituted handler is the only function vanilla is handed after a
// getter key, so the last function argument is it.
function isSubstituted(
  arg: (typeof asyncDataCalls)[number]['args'][number]
): arg is Substituted {
  return isFunction(arg)
}

/** The handler the wrapper handed vanilla, from the last recorded call. */
function substituted(): Substituted {
  const handler = asyncDataCalls.at(-1)?.args.findLast(isSubstituted)

  if (handler === undefined) throw new Error('no handler reached vanilla')

  return handler
}

/** Run the substituted handler as vanilla would. */
const run = (): Promise<Order> => substituted()(nuxtApp, context)

/** A key passed as a getter, vanilla's other function-valued argument. */
const getterKey = (): string => 'order'

describe('useBetterAsyncData: the handler vanilla runs', () => {
  it('resolves a success to its data, by reference', async () => {
    useBetterAsyncData('order', async () => ({
      data: order,
      error: undefined,
    }))

    await expect(run()).resolves.toBe(order)
  })

  it('throws a Known error as the NuxtError the fetch threw, not the variant', async () => {
    const thrown = fetchedKnownError({ _tag: 'order-locked' })
    const variant = classifyFailure(thrown)

    useBetterAsyncData('order', async () => ({
      data: undefined,
      error: variant,
    }))

    // The very error: Nuxt's `createError` hands an h3 error on as it is, so
    // the `error` ref keeps the body, its Tagged error and the status.
    await expect(run()).rejects.toBe(thrown)
    expect(variant).toEqual({ _tag: 'order-locked' })
  })

  it('throws the Request-failed variant as the NuxtError it carries', async () => {
    const variant = classifyFailure(new TypeError('fetch failed'))

    useBetterAsyncData('order', async () => ({
      data: undefined,
      error: variant,
    }))

    const failed: RequestFailed = {
      _tag: 'request-failed',
      status: undefined,
      cause: expect.anything(),
    }

    expect(variant).toEqual(failed)
    await expect(run()).rejects.toBe(
      'cause' in variant ? variant.cause : undefined
    )
  })

  it('throws a variant the fetch family did not classify as Nuxt would wrap it', async () => {
    const copied = { ...classifyFailure(fetchedKnownError({ _tag: 'x' })) }

    useBetterAsyncData('order', async () => ({
      data: undefined,
      error: copied,
    }))

    await expect(run()).rejects.toSatisfy(isError)
    await expect(run()).rejects.toMatchObject({
      statusCode: 500,
      cause: copied,
    })
  })

  it('finds the NuxtError from another copy of the classifier', async () => {
    // During server-side rendering `.try` runs in Nitro's bundle and the
    // composable in the app's: two copies of one module, one realm.
    const thrown = fetchedKnownError({ _tag: 'order-locked' })
    const nitrosCopy =
      await import('../../src/runtime/shared/errors/try-result')

    vi.resetModules()

    const appsCopy = await import('../../src/runtime/shared/errors/try-result')

    expect(appsCopy).not.toBe(nitrosCopy)
    expect(appsCopy.failureOrigin(nitrosCopy.classifyFailure(thrown))).toBe(
      thrown
    )
  })

  it('hands the caller’s handler the arguments vanilla called it with', async () => {
    const seen: unknown[][] = []

    useBetterAsyncData('order', async (...args) => {
      seen.push(args)
      return { data: order, error: undefined }
    })

    await run()

    expect(seen).toEqual([[nuxtApp, context]])
  })
})

describe('useBetterAsyncData: the arguments vanilla gets', () => {
  it('replaces the handler and hands every other argument on as it came', () => {
    const options = { lazy: true, transform: (value: Order) => value.id }

    useBetterAsyncData(
      'order',
      async () => ({ data: order, error: undefined }),
      options
    )

    const last = asyncDataCalls.at(-1)

    expect(last?.name).toBe('useAsyncData')
    expect(last?.args).toHaveLength(3)
    expect(last?.args[0]).toBe('order')
    expect(last?.args[2]).toBe(options)
  })

  it('finds the handler first in a keyless call', async () => {
    useBetterAsyncData(async () => ({ data: order, error: undefined }))

    expect(asyncDataCalls.at(-1)?.args[0]).toBeTypeOf('function')
    await expect(run()).resolves.toBe(order)
  })

  it('keeps a key the compiler appended last', async () => {
    // What `optimization.keyedComposables` makes of a keyless call; no typed
    // overload declares the appended key, so the raw wrapper takes it.
    wrapRawAsyncData(useAsyncData)(
      async () => ({ data: order, error: undefined }),
      {},
      '$key'
    )

    expect(asyncDataCalls.at(-1)?.args[2]).toBe('$key')
    await expect(run()).resolves.toBe(order)
  })

  it('reads a ref key as a key, not as the handler', async () => {
    const key = ref('order')

    useBetterAsyncData(key, async () => ({ data: order, error: undefined }))

    expect(asyncDataCalls.at(-1)?.args[0]).toBe(key)
    await expect(run()).resolves.toBe(order)
  })

  it('reads a getter key as a key, not as the handler', async () => {
    useBetterAsyncData(getterKey, async () => ({
      data: order,
      error: undefined,
    }))

    expect(asyncDataCalls.at(-1)?.args[0]).toBe(getterKey)
    await expect(run()).resolves.toBe(order)
  })

  it('leaves an argument list with no handler to vanilla’s own error', () => {
    wrapRawAsyncData(useAsyncData)('order', 'not a handler')

    expect(asyncDataCalls.at(-1)?.args).toEqual(['order', 'not a handler'])
  })

  it.each([
    ['useBetterAsyncData', useBetterAsyncData, 'useAsyncData'],
    ['useLazyBetterAsyncData', useLazyBetterAsyncData, 'useLazyAsyncData'],
  ] as const)(
    '%s delegates to vanilla’s %s, and is named for the call',
    (name, composable, vanilla) => {
      composable('order', async () => ({ data: order, error: undefined }))

      expect(asyncDataCalls.map((call) => call.name)).toEqual([vanilla])
      expect(composable.name).toBe(name)
    }
  )
})

describe('useRequestBetterFetch', () => {
  // Under vitest `import.meta.client` is falsy, so what runs here is the
  // server half, the only one with a choice to make.

  it('hands back the rendered request’s own instance', () => {
    const bound = createEventBetterFetch(() => undefined)

    setRequestEvent({ $betterFetch: bound })

    expect(useRequestBetterFetch()).toBe(bound)
  })

  it('falls back to the global when no request is being rendered', () => {
    expect(useRequestBetterFetch()).toBe($betterFetch)
  })
})
