/**
 * The dev-server race, asserted **structurally** (SPEC.md §4.5, §9.6).
 *
 * SPEC.md §4.5 measured this map landing a beat *ahead* of Nitro's — the
 * `types:extend` hook fires immediately before Nitro writes `nitro-routes.d.ts`
 * — so for a short window after a route is added the map holds a key that
 * `InternalApi` does not. §9.6 refuses that a timing test: a persistent dev
 * server inside the canonical gate is flaky by construction, and the safety is
 * not statistical anyway. This file is the property that makes the window
 * harmless, at the fast layer and with nothing running:
 *
 * **`MatchedRoutes` derives its key universe from `keyof InternalApi`**, so a
 * key the map has and Nitro does not is *unreachable by construction*. That is
 * why §4.5's 40 samples recorded `misattributed: 0` rather than merely "few",
 * and it is why no guard machinery ships.
 *
 * Must compile with **zero** diagnostics (SPEC.md §9.5 rule 3). `pnpm dev-race`
 * is where the clock is watched, ungated, when a Nuxt or Nitro bump is
 * suspected.
 *
 * **This is the one `pos/` fixture excluded from the package's own
 * `tsconfig.json`, and it has to stay excluded.** The two `declare module`
 * blocks below are augmentations, and an augmentation is global to whatever
 * program contains it. Measured: with `/api/real` added to `InternalApi` in the
 * package program, `$fetch('/api/users/42')` in `test/wire.test.ts` becomes
 * `TS2321 Excessive stack depth` — SPEC.md §10's exact failure, from one extra
 * route key. The harness compiles this alone, which is the only place it is
 * safe.
 */

import type { MatchedRoutes } from 'nitropack/types'
// Imported so the relative `declare module` below is an *augmentation* of this
// module rather than a declaration of a new one TypeScript cannot place.
import type { TypedApiErrors } from '../../../src/runtime/types'
import type { Equal, Expect, IsNever } from '../vocabulary'

// Nitro's own interface, with one route. This stands for `nitro-routes.d.ts`.
declare module 'nitropack/types' {
  interface InternalApi {
    '/api/real': { get: { ok: true } }
  }
}

// This module's map, one beat ahead: it knows a route Nitro has not keyed yet.
declare module '../../../src/runtime/types' {
  interface TypedApiErrors {
    '/api/real': { get: never }
    '/api/ghost': { get: { tag: 'ghost'; status: 404 } }
  }
}

/**
 * The map really does hold the key — otherwise the claim below would be about
 * a state that never occurs.
 */
type _mapHoldsTheGhostKey = Expect<
  Equal<TypedApiErrors['/api/ghost']['get'], { tag: 'ghost'; status: 404 }>
>

/**
 * The claim. Nothing a call site can write resolves to `/api/ghost`, so the
 * entry the map holds for it can never be indexed — whatever it says.
 */
type _ghostIsUnreachable = Expect<IsNever<MatchedRoutes<'/api/ghost'>>>

/**
 * The control. Without it, `_ghostIsUnreachable` would also pass against a
 * `MatchedRoutes` that had stopped resolving anything at all.
 */
type _realIsReachable = Expect<Equal<MatchedRoutes<'/api/real'>, '/api/real'>>
