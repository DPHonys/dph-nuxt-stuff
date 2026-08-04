import { describe, expect, it } from 'vitest'
import {
  DECLARED_ERROR_KEY,
  defineErrors,
  payload,
} from '../src/runtime/shared'

/**
 * The catalogue's *runtime* behaviour, with no server in the way.
 *
 * Almost everything this module promises is compile-time, so this file is
 * deliberately short — it covers only the two runtime paths no type assertion
 * can reach: `.raise()`, which SPEC.md §6.3 ships as an unenforced escape
 * hatch for code below the handler frame, and the unknown-tag branch behind it,
 * which is unreachable through the typed surface and therefore has no other
 * witness.
 */
describe('a catalogue at runtime', () => {
  const authErrors = defineErrors({
    unauthorized: { status: 401 },
    forbidden: {
      status: 403,
      payload: payload<{ requiredRole: 'admin' | 'owner' }>(),
    },
  })

  it('raises a declared variant as a marked error, from anywhere', () => {
    // No handler frame in sight: this is the escape hatch, and nothing checks
    // that the calling route declared `forbidden`. That is the documented cost
    // (SPEC.md §6.3).
    const thrown = catchThrown(() =>
      authErrors.raise('forbidden', { requiredRole: 'owner' })
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

    expect(catchThrown(() => picked.raise('unauthorized'))).toMatchObject({
      statusCode: 401,
      data: { [DECLARED_ERROR_KEY]: { tag: 'unauthorized', status: 401 } },
    })

    // `forbidden` is gone from the narrowed catalogue at runtime too, not only
    // in its type — otherwise `.pick()` would be a comment.
    const dropped = catchThrown(() =>
      (picked as { raise: (tag: string) => never }).raise('forbidden')
    )

    expect(dropped).toBeInstanceOf(Error)
    expect((dropped as { data?: unknown }).data).toBeUndefined()
  })

  it('refuses an unknown tag without ever marking it', () => {
    // Unreachable through the typed surface, so this is the only witness. A
    // programming mistake must not arrive at a client wearing the marker that
    // means "the server declared this".
    const thrown = catchThrown(() =>
      (authErrors as { raise: (tag: string) => never }).raise('mfa-required')
    )

    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toContain('mfa-required')
    expect((thrown as { data?: unknown }).data).toBeUndefined()
  })
})

/** `.raise()` returns `never` because it throws, so the throw is the result. */
function catchThrown(run: () => never): unknown {
  try {
    run()
  } catch (error) {
    return error
  }

  throw new Error('expected the call to throw')
}
