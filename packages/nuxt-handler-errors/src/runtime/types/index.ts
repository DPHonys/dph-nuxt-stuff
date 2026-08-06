/**
 * The `@dphonys/nuxt-handler-errors/types` entry point: the emitter's
 * augmentation target and the whole public type surface. A real module — a
 * non-exported ambient `unique symbol` does not survive declaration emit —
 * and every name re-exported below is public API for good, because an emitted
 * catalogue `.d.ts` carries them unevaluated into every consumer.
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

export { ERRORS, PAYLOAD } from './catalogue'

export type {
  AnyCatalogue,
  AnyVariant,
  ConflictGuard,
  DuplicateTags,
  ErrorCatalogue,
  ErrorStatus,
  Payload,
  PayloadArgs,
  PayloadOf,
  SerializablePayload,
  UnionOfCatalogues,
  UnserializablePayloadFields,
  VariantDef,
  VariantsOf,
} from './catalogue'

export type {
  DefineErrors,
  DefinePayload,
  DefineTypedEventHandler,
  ExtractErrorsSafe,
  Fail,
  TypedEventHandler,
  TypedHandlerContext,
  TypedHandlerFn,
} from './handler'

export type {
  DeclaredErrorBody,
  DeclaredErrorCarrier,
  DeclaredErrorKey,
  DeclaredErrorReader,
  UseDeclaredError,
} from './reader'

export type {
  $TypedFetch,
  Base$TypedFetch,
  Event$TypedFetch,
  TypedFetchSafe,
  TypedResult,
} from './fetch'

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
