import { untyped } from '@dphonys/test-utils/h3-app'
import { createError } from 'h3'
import { createFetch } from 'ofetch'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { matchError } from '../../src/runtime/shared'
import { toNuxtError } from '../../src/runtime/shared/h3'
import type { RequestFailed, TaggedError } from '../../src/runtime/types'

// The matcher at runtime: which arm it calls, with what, and when it calls
// the fallback instead. Its types are `test/types/client.spec-d.ts`'s.

type Variant =
  | { _tag: 'order-not-found'; id: number }
  | { _tag: 'order-locked' }
  | RequestFailed

/** One spy per arm, and the fallback, so a test asserts what was not called. */
function spies() {
  return {
    arms: {
      'order-not-found': vi.fn<(variant: Variant) => void>(),
      'order-locked': vi.fn<(variant: Variant) => void>(),
      'request-failed': vi.fn<(variant: Variant) => void>(),
    },
    fallback: vi.fn<(variant: { readonly _tag: string }) => void>(),
  }
}

/** A fetched failure as h3 normalises it: the Nitro body as its `data`. */
function fetched<Data extends TaggedError>(
  status: number,
  data: Data | undefined
) {
  return toNuxtError(
    createError({
      statusCode: status,
      data: { statusCode: status, message: 'm', data },
    })
  )
}

describe('matchError on a `.try` error', () => {
  it('calls the arm for the tag with the variant itself', () => {
    const { arms, fallback } = spies()
    const variant: Variant = { _tag: 'order-not-found', id: 7 }

    matchError(variant, arms, fallback)

    expect(arms['order-not-found']).toHaveBeenCalledExactlyOnceWith(variant)
    expect(arms['order-not-found'].mock.calls[0]?.[0]).toBe(variant)
    expect(arms['order-locked']).not.toHaveBeenCalled()
    expect(fallback).not.toHaveBeenCalled()
  })

  it('calls the request-failed arm for the Request-failed variant', () => {
    const { arms, fallback } = spies()
    const variant: Variant = {
      _tag: 'request-failed',
      status: undefined,
      cause: toNuxtError(new TypeError('fetch failed')),
    }

    matchError(variant, arms, fallback)

    expect(arms['request-failed']).toHaveBeenCalledExactlyOnceWith(variant)
    expect(fallback).not.toHaveBeenCalled()
  })

  it('calls the fallback for a tag no arm names, with the Tagged error', () => {
    // What a newer server sends a client built before its deploy.
    const { arms, fallback } = spies()
    const unknown = untyped({ _tag: 'order-archived', at: '2026-10-24' })

    matchError(unknown, arms, fallback)

    expect(fallback).toHaveBeenCalledExactlyOnceWith(unknown)
    for (const arm of Object.values(arms)) expect(arm).not.toHaveBeenCalled()
  })

  it('never reaches the arms object’s prototype', () => {
    // `toString` is on every object's prototype; called as an arm it would
    // be handed the variant and silently swallow the failure.
    const { arms, fallback } = spies()

    matchError(untyped({ _tag: 'toString' }), arms, fallback)

    expect(fallback).toHaveBeenCalledOnce()
  })
})

describe('matchError on a fetched NuxtError', () => {
  it('reads the Tagged error inside the body', () => {
    const { arms, fallback } = spies()
    const error = fetched(404, { _tag: 'order-not-found', id: 7 })

    matchError(error, arms, fallback)

    expect(arms['order-not-found']).toHaveBeenCalledExactlyOnceWith({
      _tag: 'order-not-found',
      id: 7,
    })
    expect(arms['order-not-found'].mock.calls[0]?.[0]).toBe(
      untyped(error.data).data
    )
  })

  it('calls the request-failed arm for a body that is not a Tagged error', () => {
    const { arms, fallback } = spies()
    const error = fetched(503, undefined)

    matchError(error, arms, fallback)

    expect(arms['request-failed']).toHaveBeenCalledExactlyOnceWith({
      _tag: 'request-failed',
      status: 503,
      cause: error,
    })
    expect(fallback).not.toHaveBeenCalled()
  })

  it.each([
    ['a network failure', () => Promise.reject(new TypeError('fetch failed'))],
    [
      'an abort',
      () =>
        Promise.reject(
          new DOMException('The operation was aborted.', 'AbortError')
        ),
    ],
  ])(
    'gives the request-failed arm no status for %s, though the error ref says 500',
    async (_, fetch) => {
      // What a `useFetch` error ref holds: ofetch's error, normalised by
      // h3's `createError` as Nuxt does, which answers `500` for a request
      // that never got a response.
      const thrown = await createFetch({ fetch })(
        'http://test.local/api/test'
      ).catch((cause: Error) => cause)
      const error = createError(thrown)
      const { arms, fallback } = spies()

      expect(error.statusCode).toBe(500)

      matchError(error, arms, fallback)

      expect(arms['request-failed']).toHaveBeenCalledExactlyOnceWith({
        _tag: 'request-failed',
        status: undefined,
        cause: error,
      })
    }
  )

  it('gives the request-failed arm the status of a 500 that did arrive', async () => {
    const thrown = await createFetch({
      fetch: async () => new Response('down', { status: 500 }),
    })('http://test.local/api/test').catch((cause: Error) => cause)
    const { arms, fallback } = spies()

    matchError(createError(thrown), arms, fallback)

    expect(arms['request-failed']).toHaveBeenCalledOnce()
    expect(arms['request-failed'].mock.calls[0]?.[0]).toMatchObject({
      status: 500,
    })
  })

  it('does not read a Tagged error at the depth a route raised it', () => {
    // That is the server recognizer's depth; on a client it is not a body.
    const { arms, fallback } = spies()
    const raised = createError({
      statusCode: 409,
      data: { _tag: 'order-locked' },
    })

    matchError(raised, arms, fallback)

    expect(arms['order-locked']).not.toHaveBeenCalled()
    expect(arms['request-failed']).toHaveBeenCalledOnce()
  })
})

describe('matchError on no failure, and on a ref', () => {
  it.each([null, undefined])('calls nothing at all for %s', (nothing) => {
    const { arms, fallback } = spies()

    matchError<Variant>(nothing, arms, fallback)

    for (const arm of Object.values(arms)) expect(arm).not.toHaveBeenCalled()
    expect(fallback).not.toHaveBeenCalled()
  })

  it('reads a ref once, when called', () => {
    const { arms, fallback } = spies()
    const error = ref<Variant | undefined>({ _tag: 'order-locked' })

    matchError(error, arms, fallback)
    error.value = { _tag: 'order-not-found', id: 7 }

    expect(arms['order-locked']).toHaveBeenCalledOnce()
    expect(arms['order-not-found']).not.toHaveBeenCalled()
  })

  it('calls nothing for a ref holding no failure', () => {
    const { arms, fallback } = spies()

    matchError(ref<Variant | null>(null), arms, fallback)

    expect(fallback).not.toHaveBeenCalled()
  })
})
