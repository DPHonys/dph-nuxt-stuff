import { describe, expect, it, vi } from 'vitest'
import { ref, shallowRef } from 'vue'
import { KNOWN_ERROR_KEY } from '../../src/runtime/shared'
import {
  matchError as matcher,
  readFloor,
} from '../../src/runtime/shared/match-error'

/**
 * The matcher's runtime behaviour — the half no type assertion can reach: the
 * two marker depths, what a malformed marker reads as, which of the arms or
 * the fallback runs, and when nothing runs at all.
 *
 * The published overloads admit typed arms only against a typed carrier, which
 * is exactly what they are for; here the arms are stubs over hand-built wire
 * shapes, so the one runtime function is called through a loose signature.
 * `test/types/matcher.test.ts` is where the overloads themselves are asserted.
 */
const matchError = matcher as (
  error: unknown,
  arms: Record<string, (variant: any) => void>,
  fallback: (error: any, unrecognized?: any) => void
) => void

/** The raise-site shape: the server's own thrown `H3Error`. */
function raised(variant: unknown): unknown {
  return {
    message: 'forbidden',
    statusCode: 403,
    data: { [KNOWN_ERROR_KEY]: variant },
  }
}

/** The fetched shape: Nitro's serialized body under ofetch's `data` getter. */
function fetched(variant: unknown): unknown {
  return {
    message: 'forbidden',
    statusCode: 403,
    data: {
      error: true,
      url: '/api/users/42',
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'forbidden',
      data: { [KNOWN_ERROR_KEY]: variant },
    },
  }
}

const forbidden = { tag: 'forbidden', status: 403, requiredRole: 'admin' }

describe('readFloor', () => {
  it('reads the raise-site depth', () => {
    expect(readFloor(raised(forbidden))).toEqual(forbidden)
  })

  it('reads the fetched depth', () => {
    expect(readFloor(fetched(forbidden))).toEqual(forbidden)
  })

  it.each([
    ['no marker at all', { data: { message: 'nope' } }],
    ['no data', { message: 'nope' }],
    ['a nullish error', undefined],
    ['a primitive error', 'boom'],
    ['a null marker', raised(null)],
    ['a string marker', raised('forbidden')],
    [
      'a function carrying the floor',
      raised(Object.assign(() => {}, forbidden)),
    ],
    ['a non-string tag', raised({ tag: 403, status: 403 })],
    ['a non-number status', raised({ tag: 'forbidden', status: '403' })],
    ['a tag-only marker', raised({ tag: 'forbidden' })],
    ['a malformed marker at the fetched depth', fetched({ tag: 'forbidden' })],
  ])('reads %s as unknown', (_case, error) => {
    expect(readFloor(error)).toBeUndefined()
  })
})

describe('matchError', () => {
  it('dispatches to the arm for the tag, with the whole variant', () => {
    const arm = vi.fn()
    const other = vi.fn()
    const fallback = vi.fn()

    matchError(
      fetched(forbidden),
      { forbidden: arm, 'user-not-found': other },
      fallback
    )

    expect(arm).toHaveBeenCalledExactlyOnceWith(forbidden)
    expect(other).not.toHaveBeenCalled()
    expect(fallback).not.toHaveBeenCalled()
  })

  it('dispatches a raise-site carrier the same way', () => {
    const arm = vi.fn()

    matchError(raised(forbidden), { forbidden: arm }, vi.fn())

    expect(arm).toHaveBeenCalledExactlyOnceWith(forbidden)
  })

  it('hands a tag this call site never declared to the fallback as unrecognized', () => {
    const arm = vi.fn()
    const fallback = vi.fn()
    const error = fetched({
      tag: 'user-suspended',
      status: 403,
      until: 'tomorrow',
    })

    matchError(error, { forbidden: arm }, fallback)

    expect(arm).not.toHaveBeenCalled()
    expect(fallback).toHaveBeenCalledExactlyOnceWith(error, {
      tag: 'user-suspended',
      status: 403,
      until: 'tomorrow',
    })
  })

  it('calls the fallback with no second argument when there is no marker', () => {
    const fallback = vi.fn()
    const error = { message: 'network', statusCode: 500 }

    matchError(error, {}, fallback)

    expect(fallback).toHaveBeenCalledExactlyOnceWith(error, undefined)
  })

  it('calls the fallback with no second argument when the marker is malformed', () => {
    const arm = vi.fn()
    const fallback = vi.fn()
    const error = fetched({ tag: 'forbidden', status: '403' })

    matchError(error, { forbidden: arm }, fallback)

    expect(arm).not.toHaveBeenCalled()
    expect(fallback).toHaveBeenCalledExactlyOnceWith(error, undefined)
  })

  it('does nothing at all for a nullish error — the absorbed `if (error)`', () => {
    const arm = vi.fn()
    const fallback = vi.fn()

    matchError(null, { forbidden: arm }, fallback)
    matchError(undefined, { forbidden: arm }, fallback)
    matchError(ref(undefined), { forbidden: arm }, fallback)

    expect(arm).not.toHaveBeenCalled()
    expect(fallback).not.toHaveBeenCalled()
  })

  it('reads a ref, once, at call time', () => {
    const arm = vi.fn()
    const error = shallowRef<unknown>(undefined)

    matchError(error, { forbidden: arm }, vi.fn())
    expect(arm).not.toHaveBeenCalled()

    error.value = fetched(forbidden)
    matchError(error, { forbidden: arm }, vi.fn())

    expect(arm).toHaveBeenCalledExactlyOnceWith(forbidden)
  })

  it('never reaches the arms object prototype', () => {
    const fallback = vi.fn()
    const variant = { tag: 'toString', status: 500 }

    matchError(fetched(variant), {}, fallback)

    expect(fallback).toHaveBeenCalledExactlyOnceWith(expect.anything(), variant)
  })
})
