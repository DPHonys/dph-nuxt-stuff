import { defineTypedEventHandler } from '@dphonys/nuxt-handler-errors/shared'
import type { DeclaredErrorsOf } from '@dphonys/nuxt-handler-errors/types'
import { authErrors } from '#shared/errors/auth'
// The same reach into the module package's own suite `users/[id].get.ts`
// makes, and for the same reason: `Equal`, `Expect` and `IsNever` are fixed
// vocabulary (SPEC.md §9.5) and a second copy here could drift.
import type { Equal, Expect, IsNever } from '../../../test/types/vocabulary'

/**
 * The **branded, `default`-keyed** half of SPEC.md §4.3's divergence case.
 *
 * No method in the file name, so Nitro keys this handler `default` and h3
 * registers it under `"all"`. Its unbranded sibling `./method-fallback.post.ts`
 * takes `post`. The emitted map therefore holds
 * `'/api/method-fallback': { default: <this route's union>, post: never }`,
 * which is the exact shape that makes the method-resolution rule observable.
 */
export default defineTypedEventHandler(
  { errors: [authErrors.pick('unauthorized', 'forbidden')] },
  (event, { fail }) => {
    const role = getQuery(event).role

    if (role === undefined) return fail('unauthorized')
    if (role !== 'owner') return fail('forbidden', { requiredRole: 'owner' })

    return { handledBy: 'default' as const }
  }
)

// ---------------------------------------------------------------------------
// Layer 3 (SPEC.md §9.1): the three-row divergence, in the real playground.
//
// **This is the assertion that proves the divergence was necessary**, and
// without it a later "simplification" back to Nitro's method-resolution rule
// looks harmless — rows one and three are identical under both rules and only
// row two disagrees. Why the two rules differ, and why h3's dispatcher is the
// authority for the one shipped, is written once on `DeclaredErrorsOf` in
// `src/runtime/types.ts` rather than restated here.
// ---------------------------------------------------------------------------

/** What the `default` handler above declares, spelled out once. */
type DefaultFailures =
  | { tag: 'unauthorized'; status: 401 }
  | { tag: 'forbidden'; status: 403; requiredRole: 'admin' | 'owner' }

/**
 * Row 1 — no method named. `M` defaults to `'get'`, `get` is absent from the
 * route's keys, so the lookup falls back to `default`. At run time h3 dispatches
 * `handlers.all`, which is this file.
 */
type _rowOneFallsBackToDefault = Expect<
  Equal<DeclaredErrorsOf<'/api/method-fallback'>, DefaultFailures>
>

/**
 * Row 2 — `POST`. The key is **present**, so the lookup stops there and answers
 * the unbranded sibling's `never`. At run time h3 dispatches `handlers.post`,
 * which is that same sibling.
 *
 * This is the row the two rules disagree on, and the reason the fallback is
 * written on presence. Rewrite it as Nitro's `[…] extends [never] ? default`
 * and this line becomes `DefaultFailures` — a POST caller typed against a
 * handler that will never run.
 */
type _rowTwoStopsAtThePresentKey = Expect<
  IsNever<DeclaredErrorsOf<'/api/method-fallback', 'POST'>>
>

/**
 * Row 3 — `DELETE`, a method neither file handles. Absent, so `default` again.
 * Together with row 1 this is what keeps the presence rule from being a blanket
 * "never fall back".
 */
type _rowThreeFallsBackToDefault = Expect<
  Equal<DeclaredErrorsOf<'/api/method-fallback', 'DELETE'>, DefaultFailures>
>

/**
 * **Nitro's success side agrees on all three rows**, so `data` and `error` stay
 * in lockstep — which is the property that makes the divergence safe rather
 * than merely defensible. `$fetch` here is vanilla's, resolving against the
 * app's really-generated `InternalApi`.
 *
 * **Never called, and a function rather than three module-scope aliases on
 * purpose.** A real `$fetch` *call* is the only thing that makes Nitro's own
 * overload resolution — `AvailableRouterMethod`, `ExtractedRouteMethod`,
 * `MiddlewareOf` — actually run; a `TypedInternalResponse<…>` alias would
 * assert about a helper instead of about the surface a consumer touches. The
 * returned array is what keeps the three consts used.
 */
async function _successSideAgrees(): Promise<unknown[]> {
  // Row 1: `get` absent → Nitro's own `MiddlewareOf<R, 'default'>` fallback.
  const noMethod = await $fetch('/api/method-fallback')
  type _one = Expect<Equal<typeof noMethod, { handledBy: 'default' }>>

  // Row 2: `post` present → the POST handler's success type, beside its `never`
  // error type. Both come from the same file, which is the whole claim.
  const post = await $fetch('/api/method-fallback', { method: 'POST' })
  type _two = Expect<Equal<typeof post, { handledBy: 'post' }>>

  // Row 3: `delete` absent → the default handler again, on both sides.
  const del = await $fetch('/api/method-fallback', { method: 'DELETE' })
  type _three = Expect<Equal<typeof del, { handledBy: 'default' }>>

  return [noMethod, post, del]
}
