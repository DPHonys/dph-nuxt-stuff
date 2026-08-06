import { defineTypedEventHandler } from '@dphonys/nuxt-handler-errors/server'
import type { DeclaredErrorsOf, Fail } from '@dphonys/nuxt-handler-errors/types'
import { chainErrors } from '~~/server/errors/chain'
// The same reach into the module package's own suite the other route files
// make: `Equal` and `Expect` are fixed vocabulary.
import type { Equal, Expect, IsNever } from '../../../../test/types/vocabulary'

/**
 * Hop 1 of 3 — the outermost route of the A→B→C chain.
 *
 * **Depth is linear and non-accumulating**, and the two halves of that claim
 * are both here. The `switch` below is exhaustive over *B's* union — both
 * members, with their payloads read — which says the chain narrows one hop at a
 * time with nothing lost. The assertions underneath say nothing was *gained*:
 * `c-gone` is reachable from B, because B declared it, and is unreachable from
 * A, because A did not.
 *
 * The explicit return annotation is Nitro's `InternalApi` cycle again — see
 * `./b.get.ts`.
 */
export default defineTypedEventHandler(
  { errors: [chainErrors.pick('a-failed')] },
  async (event, { fail }): Promise<{ hop: 'a'; from: 'b'; cookie: string }> => {
    const mode = String(getQuery(event).mode ?? 'ok')
    const result = await event.$typedFetch.safe(`/api/chain/b?mode=${mode}`)

    if (!result.ok) {
      // Two cases and no `default`. `b-upstream` is B's own variant and
      // `c-gone` is the one B chose to forward verbatim — so this `switch`
      // going exhaustive is the statement that **B's declaration**, not C's,
      // is what A sees.
      switch (result.error.tag) {
        case 'b-upstream':
          return fail('a-failed', {
            hop: `b:${result.error.from}`,
            cookie: result.error.cookie,
          })
        case 'c-gone':
          return fail('a-failed', {
            hop: `c:${result.error.resource}`,
            cookie: result.error.cookie,
          })
      }
    }

    return { hop: 'a', from: result.data.hop, cookie: result.data.cookie }
  }
)

// ---------------------------------------------------------------------------
// Layer 3: non-accumulation, against the real generated map
// ---------------------------------------------------------------------------

/**
 * **The deepest callee's tag is unreachable from the outermost route's union.**
 *
 * A route's declared union is exactly what it wrote in `errors: [...]`. Where a
 * variant is *produced* — in the body, in a helper, or forwarded from a callee
 * — is invisible to the client and is not a design question.
 */
type _cGoneIsUnreachableFromA = Expect<
  IsNever<Extract<DeclaredErrorsOf<'/api/chain/a'>, { tag: 'c-gone' }>>
>

/**
 * The control, and it is doing real work: `c-gone` **is** in B's union, because
 * B declared it in order to forward it. Without this line the assertion above
 * would pass just as well against a lookup that had stopped resolving anything
 * at all — a measured failure mode.
 */
type _cGoneIsReachableFromB = Expect<
  Equal<
    IsNever<Extract<DeclaredErrorsOf<'/api/chain/b'>, { tag: 'c-gone' }>>,
    false
  >
>

/** A's own union is one variant, and it is A's. */
type _aDeclaresOnlyItsOwn = Expect<
  Equal<
    DeclaredErrorsOf<'/api/chain/a'>,
    { tag: 'a-failed'; status: 500; hop: string; cookie: string }
  >
>

/**
 * **Accidental leakage is unrepresentable**, consumed rather than described.
 *
 * `fail` is scoped to the route's own declared union, so raising a callee's tag
 * from a route that did not declare it is `TS2345` — forwarding is always an
 * explicit act of publication. The directive is what asserts that: if raising
 * `c-gone` from A's `fail` ever started compiling, this becomes `TS2578`.
 */
declare const failFromA: Fail<DeclaredErrorsOf<'/api/chain/a'>>

export function _forwardingIsAlwaysExplicit(): never {
  // @ts-expect-error `c-gone` is B's and C's. A never declared it.
  return failFromA('c-gone', { resource: 'x', cookie: 'y' })
}
