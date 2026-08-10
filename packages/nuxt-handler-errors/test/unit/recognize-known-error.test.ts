import { describe, expect, it } from 'vitest'
import { recognizeKnownError } from '../../src/runtime/server/lib/recognize-known-error'
import { KNOWN_ERROR_KEY } from '../../src/runtime/shared/wire'
import { knownFailure } from '../fetch-channel'

/**
 * The observability read, at both marker depths.
 *
 * Deliberately its own suite rather than a line in the matcher's: this is the
 * `/server` export an integration keys `beforeSend` on, and the two depths
 * are *its* contract — a route's own thrown error (depth 1) and a fetched carrier
 * that escaped (depth 2) reach the `error` hook alike, and an integration that
 * saw only one would report half its declared failures as bugs.
 */

const variant = { tag: 'forbidden', status: 403 }

describe('recognizeKnownError', () => {
  it('reads the raise-site depth — the route’s own thrown error', () => {
    // What the `error` hook receives for a declared failure: h3's `H3Error`
    // with the marker under its own `data`.
    expect(
      recognizeKnownError({
        statusCode: 403,
        data: { [KNOWN_ERROR_KEY]: variant },
      })
    ).toEqual(variant)
  })

  it('reads the fetched-carrier depth — an escaped server-to-server failure', () => {
    // Depth 2, where the outer `data` is ofetch's parsed body and the inner one
    // is Nitro's serialized `error.data`. This one reaches the hook with
    // `unhandled` set, which is what the documented recipe keys on alongside.
    expect(recognizeKnownError(knownFailure(variant))).toEqual(variant)
  })

  it('carries the payload fields that ride inside the marker', () => {
    const rich = { tag: 'quota', status: 429, retryAfter: 30 }

    expect(recognizeKnownError({ data: { [KNOWN_ERROR_KEY]: rich } })).toEqual(
      rich
    )
  })

  it.each([
    ['a foreign error', { statusCode: 500, data: { detail: 'boom' } }],
    ['a marker with no tag', { data: { [KNOWN_ERROR_KEY]: { status: 403 } } }],
    ['a marker with no status', { data: { [KNOWN_ERROR_KEY]: { tag: 'x' } } }],
    ['a non-object marker', { data: { [KNOWN_ERROR_KEY]: 'forbidden' } }],
    ['a null marker', { data: { [KNOWN_ERROR_KEY]: null } }],
    ['a null data', { data: null }],
    ['no data at all', { statusCode: 500 }],
    ['null', null],
    ['undefined', undefined],
    ['a string', 'boom'],
  ])('answers undefined for %s', (_name, error) => {
    // Malformed reads as *unrecognized*, not as recognized-and-broken: an
    // integration filtering on this must never drop a report it cannot vouch
    // for.
    expect(recognizeKnownError(error)).toBeUndefined()
  })
})
