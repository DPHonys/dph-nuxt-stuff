/**
 * The `@dphonys/nuxt-handler-errors/types` entry point: the public type
 * surface, and the emitter's augmentation target.
 *
 * Every name below is public API for good, so the list is the names a consumer
 * has reason to *write*, not every name the package declares. The vocabulary a
 * definition is written *in* — the `Define*` hover-shorteners, the payload
 * machinery, the guards — is inferred at every call site rather than written
 * down, so it stays off this barrel and is reached by relative path inside
 * `dist`, which never consults the export map.
 *
 * What is *declared* here rather than in a sibling is everything touching a
 * scope this package does not own: `KnownApiErrors`, which the build-time
 * emitter reopens, plus the `h3` and global augmentations. A module
 * augmentation merges only with an interface declared in the module the
 * specifier resolves to — a re-exported one is shadowed instead, silently, and
 * every route key lands on the wrong interface. That constraint, not taste, is
 * why the map and its lookup live at the entry.
 */

import type { RouterMethod } from 'h3'
import type { MatchedRoutes } from 'nitropack/types'
import type { $CheckedFetch, CheckedFetch } from './fetch'

export type {
  $CheckedFetch,
  CheckedFetch,
  KnownErrorFor,
  TryResult,
} from './fetch'

export type {
  KnownError,
  KnownErrorGroup,
  KnownErrorsOf,
  KnownVariant,
  VariantsOf,
} from './known-error'

export type { CheckedEventHandler, Fail, KnownErrorsOfHandler } from './handler'

export type { Fallback, KnownErrorCarrier } from './matcher'

export type { KnownErrorBody, KnownErrorKey } from '../shared/wire'

// ---------------------------------------------------------------------------
// The generated map, and the lookup over it
// ---------------------------------------------------------------------------

/**
 * The generated route → declared-errors map, keyed exactly like Nitro's
 * `InternalApi`. The build-time emitter reopens this interface with
 * `declare module`; empty means no handler has declared anything yet.
 */
export interface KnownApiErrors {}

/**
 * **The lookup**: a route's declared union from its path alone.
 * `MatchedRoutes` is Nitro's own scoring, so a key Nitro's interface lacks is
 * unreachable by construction.
 *
 * The method fallback is **presence-based, diverging from Nitro on purpose**:
 * Nitro falls back to `default` on `never`, but here `never` is a legitimate
 * value (a handler declaring nothing), so Nitro's rule would hand a `POST`
 * caller the `default` handler's errors. Presence mirrors the h3 dispatcher.
 *
 * `never` means "declares no failures", and `R` stays unconstrained beyond
 * `string` — rejecting external URLs would break the degradation lock.
 * Wrappers need an explicit `[Declared] extends [never]` collapse, because
 * `never` does not propagate outward through a wrapper type.
 */
export type KnownErrorsOfRoute<
  R extends string,
  // Both cases admitted (the pair vanilla admits), normalised by the
  // `Lowercase<M>` below. Satisfiable from deferred positions via Nitro's own
  // `ExtractedRouteMethod`; a raw `O['method']` is not.
  M extends RouterMethod | Uppercase<RouterMethod> = 'get',
> =
  MatchedRoutes<R> extends infer Key
    ? // Distributes over multiple matched keys, and doubles as the totality
      // guard: a route this map lacks answers `never` rather than `TS2536`.
      Key extends keyof KnownApiErrors
      ? Lowercase<M> extends keyof KnownApiErrors[Key]
        ? KnownApiErrors[Key][Lowercase<M>]
        : 'default' extends keyof KnownApiErrors[Key]
          ? KnownApiErrors[Key]['default']
          : never
      : never
    : never

// ---------------------------------------------------------------------------
// The scopes this package does not own
// ---------------------------------------------------------------------------

declare module 'h3' {
  /**
   * The per-request member, declared where Nitro declares its own four.
   * `H3Event` is the one vanilla fetch surface that is augmentable — h3 declares
   * the class directly in its resolvable entry, and Nitro ships exactly this
   * augmentation itself. It is also why pinning `h3` is forbidden: an
   * augmentation binds to a *resolved path*, so a second physical h3 directory
   * lands it on the copy the consumer is not using.
   *
   * The **seam**, not the global's namespace: Nitro types `event.$fetch` as
   * more than it assigns (`.raw`/`.create`/`.native` exist in the type and not
   * on the object), and mirroring that type would inherit the lie.
   */
  interface H3Event {
    $checkedFetch: CheckedFetch
  }
}

declare global {
  /**
   * The global, declared the way Nitro declares its own — callable in a Nitro
   * handler, in `<script setup>` and in a consumer's `shared/` directory with
   * no import. `var` because that is the only form that declares a property on
   * `globalThis`, and it is Nitro's own spelling.
   */
  // eslint-disable-next-line vars-on-top
  var $checkedFetch: $CheckedFetch
}
