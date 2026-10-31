import type {
  EventHandler,
  EventHandlerRequest,
  EventHandlerResponse,
  H3Event,
} from 'h3'
import type {
  ErrorDeclarations,
  ErrorDeclarationsGuard,
} from './errors/declaration'
import type { Fail } from './errors/fail'
import type { IsAny } from './utils'

/**
 * What a route declares to `defineBetterEventHandler`: its `errors`, the
 * Error declarations keyed by tag, each checked at its key.
 */
export interface BetterHandlerOptions<Errors extends ErrorDeclarations> {
  readonly errors: Errors & ErrorDeclarationsGuard<Errors>
}

/**
 * The Handler context: the Handler's second parameter, flat, and a fresh
 * object per request. A route declaring `errors` finds its Fail helper here.
 */
export interface HandlerContext<Errors extends ErrorDeclarations> {
  readonly fail: Fail<Errors>
}

/**
 * The function a route hands `defineBetterEventHandler`. Its `event` is h3's
 * own, with default generics, so `readBody(event)` inside it is typed as h3
 * types it and nothing is claimed about the request it was not checked for.
 */
export type BetterHandlerFn<Errors extends ErrorDeclarations, Response> = (
  event: H3Event,
  context: HandlerContext<Errors>
) => Response

// Module-private and never exported, so only this package can brand a
// Handler: a structural key on a foreign handler cannot spoof the slot, and
// no app code can read or write it.
declare const knownErrors: unique symbol

/**
 * The Handler `defineBetterEventHandler` returns: an h3 handler, answering
 * with what the route's function returns once it settles, and carrying the
 * route's Known errors in a phantom slot. The slot is never assigned at
 * runtime; it exists so the generated type map can read, from the Handler's
 * type alone, what the route can fail with.
 */
export interface BetterEventHandler<
  Request extends EventHandlerRequest = EventHandlerRequest,
  Response extends EventHandlerResponse = EventHandlerResponse,
  Errors = never,
> extends EventHandler<Request, Response> {
  readonly [knownErrors]?: Errors
}

/**
 * The Known errors a branded Handler carries, or `never` for `any` and for any
 * handler this package did not produce.
 */
// `IsAny` first, because `any` matches the slot with `Errors = unknown`; the
// `unknown` guard and `Exclude` because a handler without the slot still
// matches it, being optional, with nothing or `undefined` to infer.
export type KnownErrorsOfHandler<Handler> =
  IsAny<Handler> extends true
    ? never
    : Handler extends { readonly [knownErrors]?: infer Errors }
      ? unknown extends Errors
        ? never
        : Exclude<Errors, undefined>
      : never
