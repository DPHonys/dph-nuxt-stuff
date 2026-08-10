/**
 * The declaration surface: the brand a checked handler carries, the extractor
 * that reads it back out, and the callable interfaces `../server/lib/errors`
 * implements.
 *
 * Every callable is a named `interface` with the value a `const` of that type,
 * because a named interface renders as its own name in hovers rather than as
 * its whole expanded signature.
 */

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
  SerializablePayload,
  VariantDef,
  VariantOfDef,
  VariantsOf,
} from './known-error'
import type { IsAny } from './utils'

// ---------------------------------------------------------------------------
// The brand
// ---------------------------------------------------------------------------

/**
 * A route's declared union, riding as an **optional phantom property** on an
 * interface extending h3's `EventHandler`. Optional so that a plain
 * `EventHandler` still inhabits this — safe only because the extractor below
 * is the single reader and it guards. This brand is the emitter's only
 * channel: the generated map is derived from handler types, so without it the
 * whole client surface reads `never`.
 */
export interface CheckedEventHandler<
  Request extends EventHandlerRequest = EventHandlerRequest,
  Response extends EventHandlerResponse = EventHandlerResponse,
  Errors = never,
> extends EventHandler<Request, Response> {
  __knownErrors__?: Errors
}

/**
 * Recover a route's declared union from its handler type. Guarded twice:
 * `IsAny` because an untyped handler otherwise matches with `E = unknown` and
 * silently destroys narrowing, and `Exclude<…, undefined>` because an
 * *unbranded* function still matches an all-optional property shape —
 * measured: it infers `E = undefined` (not `unknown`), so the `Exclude` alone
 * degrades it to `never`, the honest "declares none". An `unknown extends E`
 * belt on top was measured dead.
 */
export type KnownErrorsOfHandler<T> =
  IsAny<T> extends true
    ? never
    : T extends { __knownErrors__?: infer E }
      ? Exclude<E, undefined>
      : never

// ---------------------------------------------------------------------------
// The handler body
// ---------------------------------------------------------------------------

/**
 * Scoped to exactly the declared union. It throws at runtime; because it
 * returns `never`, `return fail(…)` contributes nothing to the handler's
 * inferred return type.
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

// ---------------------------------------------------------------------------
// The callable surfaces
// ---------------------------------------------------------------------------

export interface DefinePayload {
  <T extends SerializablePayload<T>>(): Payload<T>
}

/**
 * One function for one or many, with **arity** separating the overloads — so
 * neither can win on shape alone, the standing rule for every overload set in
 * this package.
 */
export interface DefineError {
  /** One definition → one error value. */
  <Tag extends string, const D extends VariantDef>(
    tag: Tag,
    def: D
  ): KnownError<VariantOfDef<Tag, D>>

  /** Several definitions → a spreadable group. */
  <const D extends Defs>(defs: D): KnownErrorGroup<VariantsOf<D>>
}

/**
 * Options object first, handler last, so the declaration sits visibly at the
 * top of the route file. `Response` has no default type parameter — that makes
 * an explicit type argument a `TS2558` arity error instead of a silent
 * collapse of the success type to `any`.
 */
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
