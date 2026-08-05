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
