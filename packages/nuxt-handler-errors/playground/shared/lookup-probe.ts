import type { DeclaredErrorsOf } from '@dphonys/nuxt-handler-errors/types'
// The same reach into the module package's own suite the route files make.
import type { Equal, Expect, IsNever } from '../../test/types/vocabulary'

/**
 * The lookup, exercised from a consumer's `shared/` directory — the context
 * SPEC.md §3's published specifiers exist for, and one a `$typedFetch` call
 * site may legally live in.
 *
 * **The narrowing below is the demo and the assertion at once.** SPEC.md §3.6
 * blesses exactly this shape for server-to-server remapping: a helper whose
 * parameter is a *callee's* declared union, narrowed exhaustively, with the
 * route named only by its path. Nothing here fetches anything, and nothing here
 * writes a wire key.
 */

/**
 * Remap `/api/users/:id`'s declared failures, naming the route by path alone.
 *
 * The `switch` has no `default` and the function promises a `string`, so
 * **exhaustiveness is the assertion** — and a structural one would not do. When
 * the emitted map's specifiers resolve to nothing, this union becomes
 * TypeScript's error type, which satisfies every `Expect<Equal<…>>` written
 * against it (SPEC-AMENDMENTS item 9) but does *not* make a `switch`
 * exhaustive: the absent final `return` becomes a real `TS2366`. This function
 * is red exactly when the lookup has stopped meaning anything.
 */
export function describeUserFailure(
  failure: DeclaredErrorsOf<'/api/users/:id'>
): string {
  switch (failure.tag) {
    case 'user-not-found':
      return `user-not-found: ${failure.userId}`
    case 'user-suspended':
      return `user-suspended until ${failure.until}`
    case 'forbidden':
      return `forbidden, needs ${failure.requiredRole}`
  }
}

// ---------------------------------------------------------------------------
// SPEC.md §6.1 — `never`, and never a compile error
//
// Every claim below is about what the lookup does with a path it has nothing to
// say about, and the answer is always the same. `never` is the honest statement
// — *"this route declares no failures"*, not *"this route cannot fail"* — and
// its cost is that it is **silent**: a developer using a typed wrapper on a
// route that never opted in gets no signal at all. That is deliberate.
// Constraining the route parameter to the map's own keys would turn the three
// cases below into compile errors and would reject external URLs, computed
// paths, and the byte-identical completion list vanilla offers.
//
// `test/types/pos/lookup.ts` makes the same four claims hermetically, and the
// overlap is not duplication: **the key universe is what differs**. This app's
// generated `InternalApi` carries Nuxt's own catch-alls — `/__nuxt_island/**`,
// `/_nuxt/**` — and a glob key is exactly the shape that could swallow an
// arbitrary string. A four-key hand-written fixture cannot show that it does
// not.
// ---------------------------------------------------------------------------

/**
 * A route this app really serves, through a plain `defineEventHandler`. It is
 * keyed in the map like every other route (SPEC.md §4.2) and extracts to
 * nothing, with no "we chose not to key this" branch anywhere.
 */
type _undeclaredRouteIsNever = Expect<IsNever<DeclaredErrorsOf<'/api/boom'>>>

/** A path no handler in this app matches. Not an error — just nothing declared. */
type _unknownRouteIsNever = Expect<
  IsNever<DeclaredErrorsOf<'/api/no-such-route'>>
>

/** An absolute external URL, which vanilla `useFetch` accepts and so must this. */
type _externalUrlIsNever = Expect<
  IsNever<DeclaredErrorsOf<'https://example.com/whatever'>>
>

/**
 * A dynamically-built path — the type a template literal or a `String` join
 * arrives as. Widening the route to `string` must not widen the answer into
 * every route's union at once, or a call site building its path would inherit
 * failures from routes it never touches.
 */
type _dynamicPathIsNever = Expect<IsNever<DeclaredErrorsOf<string>>>

/**
 * The control, without which every line above would also pass against a lookup
 * that had stopped resolving anything at all.
 */
type _declaredRouteStillAnswers = Expect<
  Equal<IsNever<DeclaredErrorsOf<'/api/users/123'>>, false>
>
