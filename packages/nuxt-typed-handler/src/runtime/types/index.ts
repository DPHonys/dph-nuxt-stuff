import type { RouterMethod } from 'h3'
import type { MatchedRoutes } from 'nitropack/types'
import type { $TypedFetch, TypedEventFetch } from './fetch'

export type * from '@dphonys/nuxt-handler-errors/types'
export type * from '@dphonys/nuxt-handler-validation/types'

export type {
  $TypedFetch,
  TypedEventFetch,
  TypedFetch,
  TypedFetchTry,
  TypedRequestOptions,
} from './fetch'

/**
 * The generated map of every route's Request input - you never write to
 * this. Keyed exactly like Nitro's `InternalApi`; the build-time emitter
 * reopens it with `declare module`, and empty means no handler has declared
 * anything yet.
 */
// Declared here, not re-exported: the emitted template augments this module
// by its package specifier, and a `declare module` on a barrel that merely
// re-exports an interface opens a second, unrelated one.
export interface KnownApiRequestInputs {}

/**
 * A route's declared Request input from its path alone; `never` means
 * "declares no sources" - the call site then types exactly as vanilla.
 */
// The `default` fallback is by presence rather than Nitro's on-`never` rule:
// `never` is a legitimate value here.
export type RequestInputOfRoute<
  R extends string,
  M extends RouterMethod | Uppercase<RouterMethod> = 'get',
> =
  MatchedRoutes<R> extends infer Key
    ? // Distributes over multiple matched keys; a route this map lacks answers
      // `never` rather than `TS2536`.
      Key extends keyof KnownApiRequestInputs
      ? Lowercase<M> extends keyof KnownApiRequestInputs[Key]
        ? KnownApiRequestInputs[Key][Lowercase<M>]
        : 'default' extends keyof KnownApiRequestInputs[Key]
          ? KnownApiRequestInputs[Key]['default']
          : never
      : never
    : never

export type {
  AtLeastOne,
  DefineTypedEventHandler,
  ReservedTagGuard,
  TypedContext,
  TypedErrors,
  TypedEventHandler,
  TypedHandlerFn,
  ValidationFailed,
} from './handler'

declare module 'h3' {
  interface H3Event {
    /** The event-bound typed fetch, forwarding the request's headers and cookies. */
    $typedFetch: TypedEventFetch
  }
}

declare global {
  /**
   * The typed fetch global - callable in a Nitro handler, in `<script setup>`
   * and in a consumer's `shared/` directory with no import.
   */
  // eslint-disable-next-line vars-on-top
  var $typedFetch: $TypedFetch
}
