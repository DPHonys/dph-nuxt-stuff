/**
 * The lookup, at layer 1 (SPEC.md §9.1): `DeclaredErrorsOf` over a
 * hand-written stand-in for a generated map, with nothing running.
 *
 * `playground/server/api/method-fallback.ts` and
 * `playground/shared/lookup-probe.ts` make the same claims against a **real**
 * Nuxt build, and that is where they count — a hand-written map cannot catch
 * the emitter writing specifiers that resolve to nothing. This file is the fast
 * half: it says what the *rule* is, in one screen, and it keeps saying it on the
 * day a Nuxt or Nitro bump takes the real build down.
 *
 * Must compile with **zero** diagnostics (SPEC.md §9.5 rule 3).
 *
 * **Excluded from the package's own `tsconfig.json`, and it has to stay
 * excluded** — for the reason `./unreachable-map-key.ts` records: the
 * `declare module 'nitropack/types'` block below is an augmentation, an
 * augmentation is global to whatever program contains it, and one extra
 * `InternalApi` key was measured to be enough to turn an unrelated `$fetch` in
 * this package into `TS2321 Excessive stack depth`. The harness compiles it
 * alone.
 */

import type {
  DeclaredErrorsOf,
  TypedApiErrors,
} from '../../../src/runtime/types'
import type { Equal, Expect, IsNever } from '../vocabulary'

/** What the branded `default` handler of `/api/y` declares. */
interface YDefaultFailure {
  tag: 'unauthorized'
  status: 401
}

/** What `/api/users/:id` declares, on `get` only. */
interface UserFailure {
  tag: 'user-not-found'
  status: 404
  userId: string
}

/** What the catch-all `/api/files/**` declares. */
interface FileFailure {
  tag: 'file-too-large'
  status: 413
}

/**
 * Nitro's own interface, standing in for a generated `nitro-routes.d.ts`. Four
 * shapes, each of which the lookup has to handle differently:
 *
 * - `/api/y` — a `default` handler with an unbranded method-specific sibling.
 * - `/api/users/:id` — a parameter segment, and **only** a `get` key.
 * - `/api/legacy` — served, but declaring nothing.
 * - `/api/files/**` — a glob.
 */
declare module 'nitropack/types' {
  interface InternalApi {
    '/api/y': { default: { via: 'default' }; post: { via: 'post' } }
    '/api/users/:id': { get: { id: string } }
    '/api/legacy': { get: { legacy: true } }
    '/api/files/**': { default: { file: true } }
  }
}

/** This module's map, keyed exactly as Nitro keys the interface above. */
declare module '../../../src/runtime/types' {
  interface TypedApiErrors {
    '/api/y': { default: YDefaultFailure; post: never }
    '/api/users/:id': { get: UserFailure }
    '/api/legacy': { get: never }
    '/api/files/**': { default: FileFailure }
  }
}

// ---------------------------------------------------------------------------
// Nitro's own route matching is the indexer (SPEC.md §4.3)
// ---------------------------------------------------------------------------

/**
 * A concrete path finds the parametrised entry by the **same** scoring Nitro
 * uses for the success type, because it is the same type doing the work.
 */
type _parameterSegmentMatches = Expect<
  Equal<DeclaredErrorsOf<'/api/users/123'>, UserFailure>
>

/** And a glob key is reached the same way. */
type _globMatches = Expect<
  Equal<DeclaredErrorsOf<'/api/files/invoices/2026.pdf'>, FileFailure>
>

/** The map's own key is a legal call-site spelling too, and finds itself. */
type _literalKeyMatches = Expect<
  Equal<DeclaredErrorsOf<'/api/users/:id'>, UserFailure>
>

// ---------------------------------------------------------------------------
// The method fallback is presence-based (SPEC.md §4.3)
// ---------------------------------------------------------------------------

/** Row 1 — `get` absent from `/api/y` → `default`. */
type _rowOneFallsBack = Expect<
  Equal<DeclaredErrorsOf<'/api/y'>, YDefaultFailure>
>

/**
 * Row 2 — `post` **present**, and what it holds is a legitimate `never`. Nitro's
 * own rule falls back on `never` and would answer `YDefaultFailure` here, which
 * is a *wrong* error type rather than an absent one.
 */
type _rowTwoStopsAtThePresentKey = Expect<
  IsNever<DeclaredErrorsOf<'/api/y', 'POST'>>
>

/** Row 3 — `delete` absent → `default` again. */
type _rowThreeFallsBack = Expect<
  Equal<DeclaredErrorsOf<'/api/y', 'DELETE'>, YDefaultFailure>
>

/** Both spellings of a method name reach the same key (SPEC.md §4.3 mandate 2). */
type _methodCaseIsNormalised = Expect<
  Equal<DeclaredErrorsOf<'/api/y', 'delete'>, YDefaultFailure>
>

/**
 * The third arm, which neither row above reaches: a route with **no `default`
 * key at all**, asked for a method it does not serve. There is nothing to fall
 * back to, so the answer is `never` — not the route's `get` union.
 *
 * Such a call is already a compile error through the typed surface, because
 * Nitro's `AvailableRouterMethod` restricts the method set to the route's own
 * keys. h3's *cross-route* fallthrough (a `POST` walking up to `/api/files/**`'s
 * `all` handler) is deliberately not modelled for the same reason: the block is
 * inherited from vanilla rather than re-implemented here.
 */
type _noDefaultToFallBackTo = Expect<
  IsNever<DeclaredErrorsOf<'/api/users/:id', 'POST'>>
>

// ---------------------------------------------------------------------------
// SPEC.md §6.1 — `never` is the answer, and it is never a compile error
// ---------------------------------------------------------------------------

/** Served, keyed, and declaring nothing. */
type _undeclaredRouteIsNever = Expect<IsNever<DeclaredErrorsOf<'/api/legacy'>>>

/** Not served at all. */
type _unknownRouteIsNever = Expect<IsNever<DeclaredErrorsOf<'/api/nope'>>>

/** An external URL, which vanilla accepts and so must this. */
type _externalUrlIsNever = Expect<
  IsNever<DeclaredErrorsOf<'https://example.com/thing'>>
>

/** A path built at run time arrives as `string`, and must not collect every union. */
type _dynamicPathIsNever = Expect<IsNever<DeclaredErrorsOf<string>>>

/**
 * The control for all four: without it they would pass just as well against a
 * lookup that had stopped resolving anything at all.
 */
type _declaredRouteStillAnswers = Expect<
  Equal<IsNever<DeclaredErrorsOf<'/api/y'>>, false>
>

/** The map really does hold what the assertions above claim it does. */
type _mapIsShapedAsClaimed = Expect<
  Equal<TypedApiErrors['/api/y']['default'], YDefaultFailure>
>
