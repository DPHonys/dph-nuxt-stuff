import type {
  EventHandler,
  EventHandlerRequest,
  EventHandlerResponse,
  H3Event,
} from 'h3'
import type { AnyKnownError, ErrorFactories } from './known-error'
import type { IsAny } from './utils'

/**
 * An h3 `EventHandler` carrying its declared error union as a phantom
 * property - the channel the generated map reads.
 */
export interface CheckedEventHandler<
  Request extends EventHandlerRequest = EventHandlerRequest,
  Response extends EventHandlerResponse = EventHandlerResponse,
  Errors = never,
> extends EventHandler<Request, Response> {
  __knownErrors__?: Errors
}

/** Recover a route's declared union from its handler type; `never` if none. */
// `IsAny` because an untyped handler otherwise matches with `E = unknown`;
// `Exclude<…, undefined>` because an unbranded function still matches an
// all-optional shape (inferring `E = undefined`) and must degrade to `never`.
export type KnownErrorsOfHandler<T> =
  IsAny<T> extends true
    ? never
    : T extends { __knownErrors__?: infer E }
      ? Exclude<E, undefined>
      : never

/** The second argument a checked handler body receives. */
export interface HandlerContext<A extends readonly AnyKnownError[]> {
  readonly errors: ErrorFactories<A>
}

/** A checked handler body. The success type infers from it with no annotation. */
export type CheckedHandlerFn<
  Request extends EventHandlerRequest,
  Response,
  A extends readonly AnyKnownError[],
> = (event: H3Event<Request>, ctx: HandlerContext<A>) => Response
