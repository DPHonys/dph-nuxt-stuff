import { describe, expect, it } from 'vitest'
import { recognizeKnownError } from '../../src/runtime/server/lib/recognize-known-error'
import { KNOWN_ERROR_KEY } from '../../src/runtime/shared/wire'
import { knownFailure } from '../fetch-channel'

// The observability read: both marker depths — a route's own thrown error
// (depth 1) and a fetched carrier that escaped (depth 2) — reach the `error`
// hook alike.

const variant = { tag: 'forbidden', status: 403 }

describe('recognizeKnownError', () => {
  it('reads the raise-site depth — the route’s own thrown error', () => {
    expect(
      recognizeKnownError({
        statusCode: 403,
        data: { [KNOWN_ERROR_KEY]: variant },
      })
    ).toEqual(variant)
  })

  it('reads the fetched-carrier depth — an escaped server-to-server failure', () => {
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
    // Malformed reads as unrecognized, never as recognized-and-broken.
    expect(recognizeKnownError(error)).toBeUndefined()
  })
})
