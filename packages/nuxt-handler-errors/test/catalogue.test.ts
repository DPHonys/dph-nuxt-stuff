import type { H3Event } from 'h3'
import { describe, expect, it } from 'vitest'
import {
  DECLARED_ERROR_KEY,
  defineErrors,
  defineTypedEventHandler,
  payload,
} from '../src/runtime/shared'

/**
 * The catalogue's *runtime* behaviour, with no server in the way.
 *
 * Almost everything this module promises is compile-time, so this file is
 * deliberately short — it covers only the runtime paths no type assertion can
 * reach: the marked error `fail` raises, the runtime half of `.pick()`'s
 * narrowing, and the unknown-tag branch behind `fail`, which is unreachable
 * through the typed surface and therefore has no other witness.
 */
describe('a catalogue at runtime', () => {
  const authErrors = defineErrors({
    unauthorized: { status: 401 },
    forbidden: {
      status: 403,
      payload: payload<{ requiredRole: 'admin' | 'owner' }>(),
    },
  })

  it('raises a declared variant as a marked error', () => {
    const thrown = catchThrown(
      defineTypedEventHandler({ errors: [authErrors] }, (_event, { fail }) =>
        fail('forbidden', { requiredRole: 'owner' })
      )
    )

    expect(thrown).toMatchObject({
      statusCode: 403,
      statusMessage: 'forbidden',
      message: 'forbidden',
      data: {
        [DECLARED_ERROR_KEY]: {
          tag: 'forbidden',
          status: 403,
          requiredRole: 'owner',
        },
      },
    })

    // Left alone, so the framework's existing "expected error" convention holds
    // and the production serializer keeps `data` (SPEC.md §5.1).
    expect(thrown).toMatchObject({ fatal: false, unhandled: false })
  })

  it('narrows to the picked tags, and forgets the rest', () => {
    const picked = authErrors.pick('unauthorized')

    expect(
      catchThrown(
        defineTypedEventHandler({ errors: [picked] }, (_event, { fail }) =>
          fail('unauthorized')
        )
      )
    ).toMatchObject({
      statusCode: 401,
      data: { [DECLARED_ERROR_KEY]: { tag: 'unauthorized', status: 401 } },
    })

    // `forbidden` is gone from the narrowed catalogue at runtime too, not only
    // in its type — otherwise `.pick()` would be a comment.
    const dropped = catchThrown(
      defineTypedEventHandler({ errors: [picked] }, (_event, { fail }) =>
        (fail as (tag: string) => never)('forbidden')
      )
    )

    expect(dropped).toBeInstanceOf(Error)
    expect((dropped as { data?: unknown }).data).toBeUndefined()
  })

  it('refuses a catalogue it did not create, at the moment it is declared', () => {
    // A catalogue carries its runtime half under a module-private `Symbol()`,
    // which is per module *instance* — so a second physical copy of the package
    // in the dependency tree produces catalogues this copy cannot read. The
    // shape is right, the brand is not, and the type level cannot see the
    // difference.
    //
    // Skipping the entry is what the code did first and it is the worse
    // failure: nothing is wrong until some later request raises a tag that
    // catalogue declared, and it is then reported as *undeclared* — which is
    // false, points away from the cause, and reaches the client as an unhandled
    // 500 instead of the declared failure the route's published type promised.
    const foreign = { pick: () => foreign } as unknown as typeof authErrors

    expect(() =>
      defineTypedEventHandler({ errors: [authErrors, foreign] }, () => 'never')
    ).toThrow(/errors\[1\] is not a catalogue created by this copy/)

    // The whole point of the throw is *when* it lands: at declaration, before
    // the route has served anything. Nothing has to be raised to reach it.
    expect(() =>
      defineTypedEventHandler({ errors: [authErrors] }, () => 'ok')
    ).not.toThrow()
  })

  it('refuses an unknown tag without ever marking it', () => {
    // Unreachable through the typed surface — `fail` is scoped to the declared
    // union — so this is the only witness. A programming mistake must not
    // arrive at a client wearing the marker that means "the server declared
    // this".
    const thrown = catchThrown(
      defineTypedEventHandler({ errors: [authErrors] }, (_event, { fail }) =>
        (fail as (tag: string) => never)('mfa-required')
      )
    )

    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toContain('mfa-required')
    expect((thrown as { data?: unknown }).data).toBeUndefined()
  })
})

/**
 * What a handler threw when invoked. `fail` needs nothing off the event, so an
 * empty object is the whole of what a request has to be here — the raise path
 * under test is `fail`'s, not h3's.
 */
function catchThrown(handler: (event: H3Event) => unknown): unknown {
  try {
    handler({} as H3Event)
  } catch (error) {
    return error
  }

  throw new Error('expected the handler to throw')
}
