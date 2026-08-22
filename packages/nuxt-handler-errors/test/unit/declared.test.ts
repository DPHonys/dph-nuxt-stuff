import { describe, expect, it } from 'vitest'
import {
  createFail,
  createKnownError,
  raiseKnown,
  resolveDeclared,
} from '../../src/runtime/internals/server'
import { defineError } from '../../src/runtime/server'
import { KNOWN_ERROR_KEY } from '../../src/runtime/shared'

// The wrapper's own behaviour is asserted in `define-error.test.ts`; this
// file covers the seams alone, through the `/internals/server` door.
describe('resolveDeclared', () => {
  const authErrors = defineError({
    unauthorized: { status: 401 },
    forbidden: { status: 403 },
  })

  it('resolves the declared tag and status pairs in declaration order', () => {
    expect(resolveDeclared([...authErrors])).toEqual([
      { tag: 'unauthorized', status: 401 },
      { tag: 'forbidden', status: 403 },
    ])
  })

  it('keeps one entry per distinct tag, first occurrence winning', () => {
    const other = defineError('unauthorized', { status: 418 })

    expect(resolveDeclared([...authErrors, other])).toEqual([
      { tag: 'unauthorized', status: 401 },
      { tag: 'forbidden', status: 403 },
    ])
  })

  it('throws the foreign-copy message at the offending index', () => {
    // Right shape, wrong brand - what a second physical copy of the module
    // produces. The message is the one consumers already see, verbatim.
    const foreign = {} as (typeof authErrors)[number]

    expect(() => resolveDeclared([...authErrors, foreign])).toThrow(
      '[nuxt-handler-errors] errors[2] is not an error created by this copy of the module. ' +
        'Either it did not come from defineError(), or there are two copies of ' +
        '@dphonys/nuxt-handler-errors in the dependency tree - a version duplicate, or a Nuxt ' +
        'layer or package that resolved its own. Deduplicate it so every error and every ' +
        'handler come from one copy.'
    )
  })
})

describe('createKnownError', () => {
  it('returns the unthrown H3Error the wire expects', () => {
    const error = createKnownError('forbidden', 403, { requiredRole: 'owner' })

    expect(error).toBeInstanceOf(Error)
    expect(error).toMatchObject({
      statusCode: 403,
      message: 'forbidden',
      data: {
        [KNOWN_ERROR_KEY]: {
          tag: 'forbidden',
          status: 403,
          requiredRole: 'owner',
        },
      },
    })

    // The reason phrase survives an escaped server-to-server throw untouched,
    // so the tag must never ride it.
    expect(error.statusMessage).toBeUndefined()

    // Left alone, so the production serializer keeps `data`.
    expect(error).toMatchObject({ fatal: false, unhandled: false })
  })

  it('keeps the floor authoritative when a field collides with it', () => {
    expect(
      createKnownError('unauthorized', 401, { tag: 'spoofed', status: 200 })
    ).toMatchObject({
      data: { [KNOWN_ERROR_KEY]: { tag: 'unauthorized', status: 401 } },
    })
  })
})

describe('raiseKnown', () => {
  it('throws exactly what createKnownError builds', () => {
    const thrown = catchThrown(() => raiseKnown('forbidden', 403, { a: 1 }))
    const built = createKnownError('forbidden', 403, { a: 1 })

    expect(thrown).toBeInstanceOf(Error)
    expect(thrown).toEqual(built)
    expect(thrown).toMatchObject({
      statusCode: 403,
      message: 'forbidden',
      data: { [KNOWN_ERROR_KEY]: { tag: 'forbidden', status: 403, a: 1 } },
    })
    expect(
      (thrown as { statusMessage?: unknown }).statusMessage
    ).toBeUndefined()
  })
})

describe('createFail', () => {
  const fail = createFail([
    { tag: 'unauthorized', status: 401 },
    { tag: 'forbidden', status: 403 },
  ])

  it('raises a declared tag as a marked error', () => {
    expect(
      catchThrown(() => fail('forbidden', { requiredRole: 'owner' }))
    ).toEqual(createKnownError('forbidden', 403, { requiredRole: 'owner' }))
  })

  it('defaults the fields to an empty record', () => {
    expect(catchThrown(() => fail('unauthorized'))).toMatchObject({
      data: { [KNOWN_ERROR_KEY]: { tag: 'unauthorized', status: 401 } },
    })
  })

  it('refuses an undeclared tag with a plain, unmarked Error', () => {
    // A programming mistake must not arrive at a client wearing the marker
    // that means "the server declared this".
    const thrown = catchThrown(() => fail('mfa-required'))

    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toBe(
      '[nuxt-handler-errors] undeclared error tag: mfa-required'
    )
    expect((thrown as { data?: unknown }).data).toBeUndefined()
    expect((thrown as { statusCode?: unknown }).statusCode).toBeUndefined()
  })
})

function catchThrown(run: () => unknown): unknown {
  try {
    run()
  } catch (error) {
    return error
  }

  throw new Error('expected a throw')
}
