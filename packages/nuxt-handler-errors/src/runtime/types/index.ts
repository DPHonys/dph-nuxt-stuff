/**
 * The `@dphonys/nuxt-handler-errors/types` entry point: the emitter's
 * augmentation target and the public type surface. Every name below is public
 * API for good, so the list is the names a consumer has reason to *write*, not
 * every name the package declares.
 *
 * That distinction is what shrank this barrel. Only one exported name is
 * forced here by the emitter — the generated `.d.ts` imports `ExtractErrorsSafe`
 * and nothing else of ours. The rest of the vocabulary (the `Define*`
 * hover-shorteners, the payload machinery, the reader and fetch internals) is
 * reached by declaration emit through *relative* paths inside `dist`, which
 * never consult the export map, so those names stay exported from their own
 * modules without being published here.
 *
 * The composition vocabulary a *wrapper* author would need to restate the
 * definer signature — `AnyCatalogue`, `UnionOfCatalogues`, `ConflictGuard`,
 * `TypedHandlerContext` — is deliberately not among them. It was published
 * briefly for a sibling package that has since been removed, and publishing on
 * spec is what this barrel is trying to stop doing: a name here is public API
 * for good, so it is added when something real names it, not before.
 *
 * What is *declared* here rather than in a sibling is everything that touches
 * a scope this package does not own: `TypedApiErrors`, which the build-time
 * emitter reopens, plus the `h3` and global augmentations. A module
 * augmentation merges only with an interface declared in the module the
 * specifier resolves to — a re-exported one gets shadowed instead, silently,
 * and every route key lands on the wrong interface. That constraint, not
 * taste, is why the map and its lookup live at the entry.
 */

import type { RouterMethod } from 'h3'
import type { MatchedRoutes } from 'nitropack/types'
import type { $TypedFetch, Event$TypedFetch } from './fetch'

export type { AnyVariant, ErrorCatalogue, VariantsOf } from './catalogue'

export type { ExtractErrorsSafe, Fail, TypedEventHandler } from './handler'

export type { DeclaredErrorBody } from './reader'

export type { $TypedFetch, Event$TypedFetch, TypedResult } from './fetch'

export type { Flatten } from './utils'

// ---------------------------------------------------------------------------
// The generated map, and the lookup over it
// ---------------------------------------------------------------------------

/**
 * The generated route → declared-errors map, keyed exactly like Nitro's
 * `InternalApi`. The build-time emitter reopens this interface with
 * `declare module`; empty means no handler has declared anything yet.
 */
export interface TypedApiErrors {}

/**
 * **The lookup**: a route's declared union from its path alone —
 * `DeclaredErrorsOf<'/api/users/:id'>`. `MatchedRoutes` is Nitro's own
 * scoring, so a key Nitro's interface lacks is unreachable by construction.
 *
 * The method fallback is **presence-based, diverging from Nitro on purpose**:
 * Nitro falls back to `default` on `never`, but here `never` is a legitimate
 * value (an unbranded handler), so Nitro's rule would hand a `POST` caller
 * the `default` handler's errors. Presence mirrors the h3 dispatcher;
 * asserted in `playground/server/api/method-fallback.ts`.
 *
 * `never` means "declares no failures", and `R` stays unconstrained beyond
 * `string` — rejecting external URLs would break the degradation lock.
 * Wrappers need an explicit `[Declared] extends [never]` collapse, because
 * `never` does not propagate outward through a wrapper type.
 */
export type DeclaredErrorsOf<
  R extends string,
  // Both cases admitted (the pair vanilla admits), normalised by the
  // `Lowercase<M>` below. Satisfiable from deferred positions via Nitro's own
  // `ExtractedRouteMethod`; a raw `O['method']` is not.
  M extends RouterMethod | Uppercase<RouterMethod> = 'get',
> =
  MatchedRoutes<R> extends infer Key
    ? // Distributes over multiple matched keys, and doubles as the totality
      // guard: a route this map lacks answers `never` rather than `TS2536`.
      Key extends keyof TypedApiErrors
      ? Lowercase<M> extends keyof TypedApiErrors[Key]
        ? TypedApiErrors[Key][Lowercase<M>]
        : 'default' extends keyof TypedApiErrors[Key]
          ? TypedApiErrors[Key]['default']
          : never
      : never
    : never

// ---------------------------------------------------------------------------
// The scopes this package does not own
// ---------------------------------------------------------------------------

declare module 'h3' {
  /**
   * The per-request member, declared where Nitro declares its own four. This
   * augmentation is why pinning `h3` is forbidden: an augmentation binds to a
   * *resolved path*, so a second physical h3 directory lands it on the copy
   * the consumer is not using. Required rather than optional, mirroring
   * Nitro's own per-request `$fetch`.
   */
  interface H3Event {
    $typedFetch: Event$TypedFetch
  }
}

declare global {
  /**
   * The global, declared the way Nitro declares its own — callable in a Nitro
   * handler, `<script setup>` and a consumer's `shared/` directory with no
   * import. `var` because that is the only form that declares a property on
   * `globalThis`, and it is Nitro's own spelling.
   */
  // eslint-disable-next-line vars-on-top
  var $typedFetch: $TypedFetch
}
