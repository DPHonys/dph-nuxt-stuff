// The `@dphonys/nuxt-handler-errors/types` entry point. `KnownApiErrors` and
// the augmentations must be DECLARED here, not re-exported: a module
// augmentation merges only with an interface declared in the module the
// specifier resolves to — a re-exported one is shadowed silently.

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

/**
 * The generated route → declared-errors map, keyed exactly like Nitro's
 * `InternalApi`. The build-time emitter reopens this interface with
 * `declare module`; empty means no handler has declared anything yet.
 */
export interface KnownApiErrors {}

/**
 * A route's declared union from its path alone; `never` means "declares no
 * failures".
 */
// The method fallback is presence-based, diverging from Nitro on purpose:
// Nitro falls back to `default` on `never`, but here `never` is a legitimate
// value, so Nitro's rule would hand a `POST` caller the `default` handler's
// errors.
export type KnownErrorsOfRoute<
  R extends string,
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

declare module 'h3' {
  interface H3Event {
    /** The event-bound checked fetch, forwarding the request's headers and cookies. */
    $checkedFetch: CheckedFetch
  }
}

declare global {
  /**
   * The checked fetch global — callable in a Nitro handler, in
   * `<script setup>` and in a consumer's `shared/` directory with no import.
   */
  // eslint-disable-next-line vars-on-top
  var $checkedFetch: $CheckedFetch
}
