import type { EventHandler, EventHandlerRequest, H3Event } from 'h3'
import type {
  ErrorDeclarations,
  ErrorDeclarationsGuard,
} from './errors/declaration'
import type { Fail } from './errors/fail'

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

/**
 * The Handler `defineBetterEventHandler` returns: an h3 handler, answering
 * with what the route's function returns once it settles.
 */
export type BetterEventHandler<Response> = EventHandler<
  EventHandlerRequest,
  Promise<Awaited<Response>>
>
