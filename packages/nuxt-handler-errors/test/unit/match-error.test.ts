import { createError } from 'h3'
import type { NuxtError } from 'nuxt/app'
import { describe, expect, it, vi } from 'vitest'
import { ref, shallowRef } from 'vue'
import { KNOWN_ERROR_KEY } from '../../src/runtime/shared'
import {
  dispatchOnFloor as matchError,
  readFloor,
} from '../../src/runtime/shared/match-error'
import { isMarkedError } from '../../src/runtime/shared/wire'
import type { KnownVariant } from '../../src/runtime/types'

// The matcher's runtime behaviour - the half no type assertion can reach. The
// arms are stubs over hand-built wire shapes, so the runtime signature under
// the overloads is what is called; the overloads themselves are asserted in
// `test/types/matcher.test.ts`.

/** A well-formed variant with whatever payload fields ride beside the floor. */
interface RichVariant extends KnownVariant {
  [field: string]: string | number
}

/** A hand-built marker - well-formed or not, that is what each case decides. */
type Marker =
  | RichVariant
  | string
  | null
  | { tag?: unknown; status?: unknown }
  | (() => void)

/** The raise-site shape: the server's own thrown `H3Error`. */
function raised(variant: Marker): NuxtError {
  return createError({
    message: 'forbidden',
    statusCode: 403,
    data: { [KNOWN_ERROR_KEY]: variant },
  })
}

/** The fetched shape: Nitro's serialized body under ofetch's `data` getter. */
function fetched(variant: Marker): NuxtError {
  return createError({
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
  })
}

const forbidden = { tag: 'forbidden', status: 403, requiredRole: 'admin' }

describe('readFloor', () => {
  it('reads the raise-site depth', () => {
    expect(readFloor(raised(forbidden))).toEqual(forbidden)
  })

  it('reads the fetched depth', () => {
    expect(readFloor(fetched(forbidden))).toEqual(forbidden)
  })

  it('hands the wire object back itself, not a copy', () => {
    const body = { data: { [KNOWN_ERROR_KEY]: forbidden } }

    expect(readFloor(createError({ data: body }))).toBe(
      body.data[KNOWN_ERROR_KEY]
    )
  })

  it.each([
    ['no marker at all', createError({ data: { message: 'nope' } })],
    ['no data', createError({ message: 'nope' })],
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

describe('isMarkedError - the boundary under readFloor', () => {
  it.each([
    ['a nullish value', undefined],
    ['null', null],
    ['a primitive', 'boom'],
    ['an array', [{ [KNOWN_ERROR_KEY]: forbidden }]],
    ['a null data', { data: null }],
    ['a marker that is an array', { data: { [KNOWN_ERROR_KEY]: [forbidden] } }],
  ])('rejects %s', (_case, value) => {
    expect(isMarkedError(value)).toBe(false)
  })

  it('accepts a plain object shaped like the wire, at either depth', () => {
    expect(isMarkedError({ data: { [KNOWN_ERROR_KEY]: forbidden } })).toBe(true)
    expect(
      isMarkedError({ data: { data: { [KNOWN_ERROR_KEY]: forbidden } } })
    ).toBe(true)
  })
})

describe('matchError', () => {
  it('dispatches to the arm for the tag, with the whole variant', () => {
    const arm = vi.fn()
    const other = vi.fn()
    const fallback = vi.fn()

    matchError(
      fetched(forbidden),
      { forbidden: arm, userNotFound: other },
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
      tag: 'userSuspended',
      status: 403,
      until: 'tomorrow',
    })

    matchError(error, { forbidden: arm }, fallback)

    expect(arm).not.toHaveBeenCalled()
    expect(fallback).toHaveBeenCalledExactlyOnceWith(error, {
      tag: 'userSuspended',
      status: 403,
      until: 'tomorrow',
    })
  })

  it('calls the fallback with no second argument when there is no marker', () => {
    const fallback = vi.fn()
    const error = createError({ message: 'network', statusCode: 500 })

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

  it('does nothing at all for a nullish error - the absorbed `if (error)`', () => {
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
    const error = shallowRef<NuxtError | undefined>(undefined)

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
