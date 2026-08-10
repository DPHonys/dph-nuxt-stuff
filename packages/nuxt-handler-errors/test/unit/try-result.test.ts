import { createError } from 'h3'
import { describe, expect, it } from 'vitest'
import {
  toNuxtError,
  toTryResult,
} from '../../src/runtime/shared/checked-fetch'
import { knownFailure, settled } from '../fetch-channel'

/**
 * The normalisation `.try` is built on — **one** function, used by the global
 * and the event-bound surfaces alike, so what a failure looks like cannot
 * differ by which instance produced it.
 *
 * Two claims are enumerated rather than sampled. First, it catches
 * *everything*: `.try` has no rethrow channel, so any shape that escaped would
 * reach a caller who has already been told `error`'s presence is the whole
 * discriminant. Second, the carrier really carries `status` — a bare `H3Error`
 * sets only `statusCode`, and the `NuxtError` face has to be runtime-true on
 * the server too, where nothing else defines it.
 */

describe('toNuxtError', () => {
  const causes: readonly [name: string, cause: unknown][] = [
    [
      'an HTTP failure with the wire body',
      knownFailure({ tag: 't', status: 404 }),
    ],
    ['a network error', new TypeError('fetch failed')],
    ['an abort', new DOMException('The operation was aborted.', 'AbortError')],
    ['a parse error', new SyntaxError('Unexpected token < in JSON')],
    ['a plain Error', new Error('boom')],
    ['a thrown string', 'not an object'],
    ['a thrown number', 7],
    ['a thrown null', null],
    ['a thrown undefined', undefined],
    ['a thrown array', ['tag', 'status']],
    ['an object with nothing on it', {}],
  ]

  it.each(causes)(
    'normalises %s to an error carrying a status',
    (_n, cause) => {
      const error = toNuxtError(cause)

      expect(error).toBeInstanceOf(Error)
      expect(typeof error.status).toBe('number')
      expect(error.status).toBe(error.statusCode)
    }
  )

  it('populates status from the failure’s own statusCode', () => {
    // The standing requirement, on the shape it exists for: h3's `createError`
    // copies `statusCode` off a `FetchError` and sets nothing else, so without
    // this a server-side carrier answers `error.status === undefined` while the
    // client's answers 404 — one matcher, two truths.
    const error = toNuxtError(knownFailure({ tag: 't', status: 404 }))

    expect(error.status).toBe(404)
    expect(error.statusText).toBe('Not Found')
  })

  it('keeps the wire depth intact, so one matcher serves both runtimes', () => {
    // `createError` copies `input.data` across wholesale, which is what puts a
    // server-side carrier's variant at exactly the client chain's depth.
    const error = toNuxtError(knownFailure({ tag: 't', status: 404 }))

    expect((error.data as { data: Record<string, unknown> }).data).toEqual({
      __knownError__: { tag: 't', status: 404 },
    })
  })

  it('returns an error h3 already made, unwrapped', () => {
    // `createError` short-circuits on its own errors — no re-wrap, no second
    // envelope, no depth change.
    const raised = createError({ statusCode: 403, message: 'forbidden' })

    expect(toNuxtError(raised)).toBe(raised)
    expect(toNuxtError(raised).status).toBe(403)
  })

  it('does not overwrite a status a NuxtError already defines', () => {
    // A hydrated carrier arrives with Nuxt's own getters on it; redefining them
    // would be this module deciding it knows better.
    const hydrated = Object.assign(createError({ statusCode: 500 }), {
      status: 418,
    })

    expect(toNuxtError(hydrated).status).toBe(418)
  })
})

describe('toTryResult', () => {
  it('answers the success arm with the resolved value', async () => {
    expect(await toTryResult(() => Promise.resolve({ id: '7' }))).toEqual({
      data: { id: '7' },
      error: undefined,
    })
  })

  it('answers the failure arm with the carrier, not the flat variant', async () => {
    // The arms of `matchError` take the *envelope*: the same carrier the
    // composable's error ref holds, so one set of arms serves both surfaces.
    const result = await toTryResult(() =>
      Promise.reject(knownFailure({ tag: 'user-not-found', status: 404 }))
    )

    expect(result.data).toBeUndefined()
    expect(result.error?.status).toBe(404)
    expect(
      (result.error?.data as { data: Record<string, unknown> }).data
    ).toEqual({ __knownError__: { tag: 'user-not-found', status: 404 } })
  })

  it('sets error to undefined on success, so the union discriminates', async () => {
    // `if (error) return` narrows `data` only because the success arm really
    // carries the property. A success that merely omitted `error` would type
    // the same and narrow the same, but `'error' in result` is what a runtime
    // consumer of the pair can rely on.
    const result = await toTryResult(() => Promise.resolve('ok'))

    expect('error' in result).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('swallows nothing and rethrows nothing', async () => {
    // The `.safe` predecessor rethrew anything that was not a declared marker.
    // That is dead: a caller told `error`'s presence is the discriminant has no
    // second channel to watch.
    const result = await settled(() =>
      toTryResult(() => Promise.reject(new Error('boom')))
    )

    expect(result.threw).toBe(false)
    expect((result.value as { error: Error }).error.message).toBe('boom')
  })
})
