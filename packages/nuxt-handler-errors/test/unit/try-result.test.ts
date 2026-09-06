import { createError } from 'h3'
import { describe, expect, it } from 'vitest'
import {
  toNuxtError,
  toTryResult,
} from '../../src/runtime/shared/checked-fetch'
import { knownFailure, settled } from '../fetch-channel'

// The normalisation `.try` is built on - one function shared by the global and
// event-bound surfaces. It must catch *everything* (`.try` has no rethrow
// channel) and the carrier must really carry `status`, which a bare `H3Error`
// does not set.

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
      expect(error.status).toBeTypeOf('number')
      expect(error.status).toBe(error.statusCode)
    }
  )

  it('populates status from the failure’s own statusCode', () => {
    // h3's `createError` copies `statusCode` off a `FetchError` and sets
    // nothing else - without this, `error.status` differs between runtimes.
    const error = toNuxtError(knownFailure({ tag: 't', status: 404 }))

    expect(error.status).toBe(404)
    expect(error.statusText).toBe('Not Found')
  })

  it('keeps the wire depth intact, so one matcher serves both runtimes', () => {
    const error = toNuxtError(knownFailure({ tag: 't', status: 404 }))

    expect(error.data).toMatchObject({
      data: { __knownError__: { tag: 't', status: 404 } },
    })
  })

  it('returns an error h3 already made, unwrapped', () => {
    const raised = createError({ statusCode: 403, message: 'forbidden' })

    expect(toNuxtError(raised)).toBe(raised)
    expect(toNuxtError(raised).status).toBe(403)
  })

  it('does not overwrite a status a NuxtError already defines', () => {
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
    const result = await toTryResult(() =>
      Promise.reject(knownFailure({ tag: 'user-not-found', status: 404 }))
    )

    expect(result.data).toBeUndefined()
    expect(result.error?.status).toBe(404)
    expect(result.error?.data).toMatchObject({
      data: { __knownError__: { tag: 'user-not-found', status: 404 } },
    })
  })

  it('sets error to undefined on success, so the union discriminates', async () => {
    // The success arm must really carry the property: `'error' in result` is
    // what a runtime consumer of the pair can rely on.
    const result = await toTryResult(() => Promise.resolve('ok'))

    expect('error' in result).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('swallows nothing and rethrows nothing', async () => {
    const result = await settled(() =>
      toTryResult(() => Promise.reject(new Error('boom')))
    )

    if (result.threw) throw new Error('rethrown')
    expect(result.value.error?.message).toBe('boom')
  })
})
