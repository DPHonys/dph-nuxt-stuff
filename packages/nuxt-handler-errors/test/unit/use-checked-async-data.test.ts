import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import type { NuxtError } from '#app'
import {
  useCheckedAsyncData,
  useLazyCheckedAsyncData,
} from '../../src/runtime/app/composables/use-checked-async-data'
import { asyncDataCalls } from '../doubles/nuxt-app'

// The wrapper must replace the right argument (vanilla's own split, not
// "argument 0"), forward everything else by reference, and the substituted
// handler must unwrap a success and rethrow the failure carrier *identically*
// - a copy would change the marker's depth.

interface User {
  id: string
}

const user: User = { id: '42' }

/** A carrier, identified by reference. Only `.error`'s truthiness is read. */
const carrier = { statusCode: 404, data: { marker: true } } as NuxtError

/** The handler the wrapper substituted, from the last recorded call. */
function substituted(): (...args: unknown[]) => Promise<unknown> {
  const last = asyncDataCalls.at(-1)

  if (last === undefined) throw new Error('nothing reached the vanilla double')

  // The *last* function argument: a getter key is a function too, and it can
  // only ever sit before the handler.
  const handler = last.args.findLast((arg) => typeof arg === 'function')

  if (handler === undefined) throw new Error('no handler was forwarded')

  return handler as (...args: unknown[]) => Promise<unknown>
}

beforeEach(() => {
  asyncDataCalls.length = 0
})

/** A key passed as a getter - vanilla's other key form. */
const getterKey = (): string => 'user'

describe('unwrap-or-rethrow', () => {
  it('unwraps a success to the plain data, by reference', async () => {
    useCheckedAsyncData('user', async () => ({
      data: user,
      error: undefined,
    }))

    await expect(substituted()()).resolves.toBe(user)
  })

  it('rethrows the carrier itself, not a copy', async () => {
    useCheckedAsyncData('user', async () => ({
      data: undefined,
      error: carrier,
    }))

    await expect(substituted()()).rejects.toBe(carrier)
  })

  it('forwards vanilla the handler arguments it calls with', async () => {
    const seen: unknown[] = []

    useCheckedAsyncData('user', async (...args: unknown[]) => {
      seen.push(...args)
      return { data: user, error: undefined }
    })

    const signal = { signal: new AbortController().signal }
    await substituted()('nuxt-app', signal)

    expect(seen).toEqual(['nuxt-app', signal])
  })
})

describe('the delegation', () => {
  it('replaces the handler and leaves every other argument identical', () => {
    const opts = { lazy: true, transform: (value: User) => value }

    useCheckedAsyncData(
      'user',
      async () => ({ data: user, error: undefined }),
      opts
    )

    const last = asyncDataCalls.at(-1)

    expect(last?.name).toBe('useAsyncData')
    expect(last?.args[0]).toBe('user')
    expect(last?.args[2]).toBe(opts)
  })

  it('wraps the handler in vanilla position 0 for the keyless form', async () => {
    useCheckedAsyncData(async () => ({ data: user, error: undefined }))

    const last = asyncDataCalls.at(-1)

    expect(typeof last?.args[0]).toBe('function')
    await expect(substituted()()).resolves.toBe(user)
  })

  it('keeps a compiler-injected auto-key in vanilla last position', async () => {
    // What `optimization.keyedComposables` produces: the key appended last.
    const keyless = useCheckedAsyncData as unknown as (
      ...args: unknown[]
    ) => unknown

    keyless(async () => ({ data: user, error: undefined }), {}, '$auto')

    const last = asyncDataCalls.at(-1)

    expect(last?.args[2]).toBe('$auto')
    await expect(substituted()()).resolves.toBe(user)
  })

  it('reads a ref key as a key, not as the handler', async () => {
    const refKey = ref('user')

    useCheckedAsyncData(refKey, async () => ({
      data: user,
      error: undefined,
    }))

    const last = asyncDataCalls.at(-1)

    expect(last?.args[0]).toBe(refKey)
    await expect(substituted()()).resolves.toBe(user)
  })

  it('reads a getter key as a key, not as the handler', async () => {
    useCheckedAsyncData(getterKey, async () => ({
      data: user,
      error: undefined,
    }))

    const last = asyncDataCalls.at(-1)

    expect(last?.args[0]).toBe(getterKey)
    await expect(substituted()()).resolves.toBe(user)
  })

  it('sends the lazy twin to vanilla own lazy composable', () => {
    useLazyCheckedAsyncData('user', async () => ({
      data: user,
      error: undefined,
    }))

    expect(asyncDataCalls.at(-1)?.name).toBe('useLazyAsyncData')
  })
})
