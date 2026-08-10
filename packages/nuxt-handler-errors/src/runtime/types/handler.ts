import type {
  EventHandler,
  EventHandlerRequest,
  EventHandlerResponse,
  H3Event,
} from 'h3'
import type {
  AnyKnownError,
  ConflictGuard,
  Defs,
  KnownError,
  KnownErrorGroup,
  KnownErrorsOf,
  KnownVariant,
  Payload,
  PayloadArgs,
  SerializableDef,
  SerializableDefs,
  SerializablePayload,
  VariantDef,
  VariantOfDef,
  VariantsOf,
} from './known-error'
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

/**
 * Raise one of the route's declared failures. Throws; returns `never`, so
 * `return fail(…)` contributes nothing to the inferred success type.
 */
export type Fail<E extends KnownVariant> = <T extends E['tag']>(
  tag: T,
  ...payload: PayloadArgs<E, T>
) => never

/** The second argument a checked handler body receives. */
export interface HandlerContext<E extends KnownVariant> {
  fail: Fail<E>
}

/** A checked handler body. The success type infers from it with no annotation. */
export type CheckedHandlerFn<
  Request extends EventHandlerRequest,
  Response,
  E extends KnownVariant,
> = (event: H3Event<Request>, ctx: HandlerContext<E>) => Response

export interface DefinePayload {
  <T extends SerializablePayload<T>>(): Payload<T>
}

/** One function for one or many, with arity separating the overloads. */
export interface DefineError {
  /** One definition → one error value. */
  <Tag extends string, const D extends VariantDef>(
    tag: Tag,
    def: SerializableDef<D> & D
  ): KnownError<VariantOfDef<Tag, D>>

  /** Several definitions → a spreadable group. */
  <const D extends Defs>(
    defs: SerializableDefs<D> & D
  ): KnownErrorGroup<VariantsOf<D>>
}

// `Response` has no default type parameter on purpose: an explicit type
// argument becomes an arity error instead of silently collapsing the
// success type to `any`.
export interface DefineCheckedEventHandler {
  <
    const A extends ReadonlyArray<AnyKnownError>,
    Response extends EventHandlerResponse,
    Request extends EventHandlerRequest = EventHandlerRequest,
  >(
    options: ConflictGuard<A> & { errors: A },
    handler: CheckedHandlerFn<Request, Response, KnownErrorsOf<A>>
  ): CheckedEventHandler<Request, Response, KnownErrorsOf<A>>
}
