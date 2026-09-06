import { createError } from 'h3'
import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import type { NuxtApp } from '#app'
import type { AsyncDataHandler } from '#app/composables/asyncData'
import {
  useCheckedAsyncData,
  useLazyCheckedAsyncData,
  wrapRawAsyncData,
} from '../../src/runtime/app/composables/use-checked-async-data'
import { functionSchema } from '../../src/runtime/shared/primitives'
import { asyncDataCalls, useAsyncData } from '../doubles/nuxt-app'

// The wrapper must replace the right argument (vanilla's own split, not
// "argument 0"), forward everything else by reference, and the substituted
// handler must unwrap a success and rethrow the failure carrier *identically*
// - a copy would change the marker's depth.

interface User {
  id: string
}

const user: User = { id: '42' }

/** A carrier, identified by reference. Only `.error`'s truthiness is read. */
const carrier = createError({ statusCode: 404, data: { marker: true } })

// SAFETY: the substituted handler forwards its arguments to the caller's
// handler untouched and reads nothing off them; a bare object stands in for
// the app, and identity is all this suite asserts about it.
const nuxtApp = {} as NuxtApp

const signal = { signal: new AbortController().signal }

// The substituted handler resolves what the caller's handler put under
// `data` - `user`, in every success case this file builds.
function isSubstituted(
  arg: (typeof asyncDataCalls)[number]['args'][number]
): arg is AsyncDataHandler<User> {
  return functionSchema.safeParse(arg).success
}

/** The handler the wrapper substituted, from the last recorded call. */
function substituted(): AsyncDataHandler<User> {
  const last = asyncDataCalls.at(-1)

  if (last === undefined) throw new Error('nothing reached the vanilla double')

  // The *last* function argument: a getter key is a function too, and it can
  // only ever sit before the handler.
  const handler = last.args.findLast(
    (arg) => functionSchema.safeParse(arg).success
  )

  if (handler === undefined || !isSubstituted(handler)) {
    throw new Error('no handler was forwarded')
  }

  return handler
}

/** Run the substituted handler as vanilla would. */
const run = () => substituted()(nuxtApp, signal)

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

    await expect(run()).resolves.toBe(user)
  })

  it('rethrows the carrier itself, not a copy', async () => {
    useCheckedAsyncData('user', async () => ({
      data: undefined,
      error: carrier,
    }))

    await expect(run()).rejects.toBe(carrier)
  })

  it('forwards vanilla the handler arguments it calls with', async () => {
    const seen: Parameters<AsyncDataHandler<User>>[] = []

    useCheckedAsyncData('user', async (...args) => {
      seen.push(args)
      return { data: user, error: undefined }
    })

    await run()

    expect(seen).toEqual([[nuxtApp, signal]])
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

    expect(last?.args[0]).toBeTypeOf('function')
    await expect(run()).resolves.toBe(user)
  })

  it('keeps a compiler-injected auto-key in vanilla last position', async () => {
    // What `optimization.keyedComposables` produces: the key appended last,
    // after the public overloads' last parameter - so the raw wrapper, the
    // variadic signature vanilla's runtime reads, is what takes it.
    const keyless = wrapRawAsyncData(useAsyncData)

    keyless(async () => ({ data: user, error: undefined }), {}, '$auto')

    const last = asyncDataCalls.at(-1)

    expect(last?.args[2]).toBe('$auto')
    await expect(run()).resolves.toBe(user)
  })

  it('reads a ref key as a key, not as the handler', async () => {
    const refKey = ref('user')

    useCheckedAsyncData(refKey, async () => ({
      data: user,
      error: undefined,
    }))

    const last = asyncDataCalls.at(-1)

    expect(last?.args[0]).toBe(refKey)
    await expect(run()).resolves.toBe(user)
  })

  it('reads a getter key as a key, not as the handler', async () => {
    useCheckedAsyncData(getterKey, async () => ({
      data: user,
      error: undefined,
    }))

    const last = asyncDataCalls.at(-1)

    expect(last?.args[0]).toBe(getterKey)
    await expect(run()).resolves.toBe(user)
  })

  it('sends the lazy twin to vanilla own lazy composable', () => {
    useLazyCheckedAsyncData('user', async () => ({
      data: user,
      error: undefined,
    }))

    expect(asyncDataCalls.at(-1)?.name).toBe('useLazyAsyncData')
  })
})
