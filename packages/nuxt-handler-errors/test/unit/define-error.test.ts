import type { H3Event } from 'h3'
import { describe, expect, it } from 'vitest'
import {
  defineCheckedEventHandler,
  defineError,
  payload,
} from '../../src/runtime/server'
import { KNOWN_ERROR_KEY } from '../../src/runtime/shared'

// The definition surface's runtime behaviour — only the paths no type
// assertion can reach; the rest of the contract lives in
// `test/types/definition-surface.test.ts`.
describe('defined errors at runtime', () => {
  const authErrors = defineError({
    unauthorized: { status: 401 },
    forbidden: {
      status: 403,
      payload: payload<{ requiredRole: 'admin' | 'owner' }>(),
    },
  })

  const maintenance = defineError('maintenance', { status: 503 })

  it('raises a declared variant as a marked error', () => {
    const thrown = catchThrown(
      defineCheckedEventHandler(
        { errors: [...authErrors, maintenance] },
        (_event, { fail }) => fail('forbidden', { requiredRole: 'owner' })
      )
    )

    expect(thrown).toMatchObject({
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
    expect(
      (thrown as { statusMessage?: unknown }).statusMessage
    ).toBeUndefined()

    // Left alone, so the production serializer keeps `data`.
    expect(thrown).toMatchObject({ fatal: false, unhandled: false })
  })

  it('keeps the floor authoritative when a payload field collides with it', () => {
    const thrown = catchThrown(
      defineCheckedEventHandler(
        { errors: [...authErrors] },
        (_event, { fail }) =>
          (fail as (tag: string, fields: Record<string, unknown>) => never)(
            'unauthorized',
            { tag: 'spoofed', status: 200 }
          )
      )
    )

    expect(thrown).toMatchObject({
      data: { [KNOWN_ERROR_KEY]: { tag: 'unauthorized', status: 401 } },
    })
  })

  it('narrows to the picked tags, and forgets the rest', () => {
    const picked = authErrors.pick('unauthorized')

    expect(picked).toHaveLength(1)
    expect(
      catchThrown(
        defineCheckedEventHandler({ errors: [...picked] }, (_event, { fail }) =>
          fail('unauthorized')
        )
      )
    ).toMatchObject({
      statusCode: 401,
      data: { [KNOWN_ERROR_KEY]: { tag: 'unauthorized', status: 401 } },
    })

    // `forbidden` is gone from the picked group at runtime too, not only in
    // its type.
    const dropped = catchThrown(
      defineCheckedEventHandler({ errors: [...picked] }, (_event, { fail }) =>
        (fail as (tag: string) => never)('forbidden')
      )
    )

    expect(dropped).toBeInstanceOf(Error)
    expect((dropped as { data?: unknown }).data).toBeUndefined()
  })

  it('holds one error per distinct tag, first occurrence winning', () => {
    // Repetition is absorbed rather than rejected — a union dedupes itself, so
    // the types stay silent and the runtime list must say the same thing.
    expect(authErrors.pick('unauthorized', 'unauthorized')).toHaveLength(1)
    expect(authErrors.pick()).toHaveLength(0)

    const other = defineError({ unauthorized: { status: 401 } })
    const thrown = catchThrown(
      defineCheckedEventHandler(
        { errors: [...authErrors, ...other] },
        (_event, { fail }) => fail('unauthorized')
      )
    )

    expect(thrown).toMatchObject({ statusCode: 401 })
  })

  it('refuses an error it did not create, at the moment it is declared', () => {
    // The runtime half rides a module-private `Symbol()`, so a second physical
    // copy of the package produces values this copy cannot read — right shape,
    // wrong brand. The throw must land at declaration, before the route has
    // served anything; skipping the entry would surface later as a false
    // "undeclared tag" 500.
    const foreign = {} as (typeof authErrors)[number]

    expect(() =>
      defineCheckedEventHandler(
        { errors: [...authErrors, foreign] },
        () => 'never'
      )
    ).toThrow(/errors\[2\] is not an error created by this copy/)

    expect(() =>
      defineCheckedEventHandler({ errors: [...authErrors] }, () => 'ok')
    ).not.toThrow()
  })

  it('refuses an unknown tag without ever marking it', () => {
    // Unreachable through the typed surface — a programming mistake must not
    // arrive at a client wearing the marker that means "the server declared
    // this".
    const thrown = catchThrown(
      defineCheckedEventHandler(
        { errors: [...authErrors] },
        (_event, { fail }) => (fail as (tag: string) => never)('mfa-required')
      )
    )

    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toContain('mfa-required')
    expect((thrown as { data?: unknown }).data).toBeUndefined()
  })
})

/** What a handler threw when invoked; `fail` needs nothing off the event. */
function catchThrown(handler: (event: H3Event) => unknown): unknown {
  try {
    handler({} as H3Event)
  } catch (error) {
    return error
  }

  throw new Error('expected the handler to throw')
}
