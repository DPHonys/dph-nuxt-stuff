/**
 * The server declaration surface: the brand a typed handler carries, the
 * extractor that reads it back out, and the three callable interfaces
 * `../server/lib/errors` implements.
 *
 * Only `ExtractErrorsSafe`, `Fail` and `TypedEventHandler` reach `./index`.
 * The three `Define*` interfaces exist to keep hovers short and are named by
 * nothing a consumer writes, so they stay here and are reached by relative
 * path.
 */

import type {
  EventHandler,
  EventHandlerRequest,
  EventHandlerResponse,
  H3Event,
} from 'h3'
import type {
  AnyCatalogue,
  AnyVariant,
  ConflictGuard,
  ErrorCatalogue,
  Payload,
  PayloadArgs,
  SerializablePayload,
  UnionOfCatalogues,
  VariantDef,
  VariantsOf,
} from './catalogue'
import type { IsAny } from './utils'

// ---------------------------------------------------------------------------
// The brand
// ---------------------------------------------------------------------------

/**
 * A route's declared union, riding as an **optional phantom property** on an
 * interface extending h3's `EventHandler` (h3's own marker-property idiom).
 * `ReturnType` reads only the call signature, so the brand and the response
 * payload occupy disjoint positions and vanilla `useFetch` stays clean
 * structurally. Optional, so any plain `EventHandler` still inhabits this.
 */
export interface TypedEventHandler<
  Request extends EventHandlerRequest = EventHandlerRequest,
  Response extends EventHandlerResponse = EventHandlerResponse,
  Errors = never,
> extends EventHandler<Request, Response> {
  __declaredErrors__?: Errors
}

/**
 * Recover a route's declared union from its handler type. `Exclude<…,
 * undefined>` guards the hand-written-brand case; an unbranded handler yields
 * `never` (deliberately not `unknown`); and the `IsAny` guard is required —
 * without it an untyped route matches with `E = unknown`, silently destroying
 * narrowing everywhere. No unguarded `ExtractErrors` exists beside it.
 */
export type ExtractErrorsSafe<T> =
  IsAny<T> extends true
    ? never
    : T extends { __declaredErrors__?: infer E }
      ? Exclude<E, undefined>
      : never

/**
 * Scoped to exactly the declared union. It throws at runtime; because it
 * returns `never`, `return fail(…)` contributes nothing to the handler's
 * inferred return type.
 */
export type Fail<E extends AnyVariant> = <T extends E['tag']>(
  tag: T,
  ...payload: PayloadArgs<E, T>
) => never

/** The second argument a typed handler body receives. */
export interface TypedHandlerContext<E extends AnyVariant> {
  fail: Fail<E>
}

/** A typed handler body. The success type infers from it with no annotation. */
export type TypedHandlerFn<
  Request extends EventHandlerRequest,
  Response,
  E extends AnyVariant,
> = (event: H3Event<Request>, ctx: TypedHandlerContext<E>) => Response

// ---------------------------------------------------------------------------
// The callable surfaces
// ---------------------------------------------------------------------------

/**
 * Every callable is a named `interface` with the value a `const` of that
 * type, because a named interface renders as its own name in hovers (measured
 * 55 chars against 1075 as a bare `function` declaration).
 */
export interface DefinePayload {
  <T extends SerializablePayload<T>>(): Payload<T>
}

/** See {@link DefinePayload} for why this is an interface. */
export interface DefineErrors {
  <const D extends Record<string, VariantDef>>(
    defs: D
  ): ErrorCatalogue<VariantsOf<D>>
}

/**
 * The server declaration surface: options object first, handler last, so the
 * declaration sits visibly at the top of the route file. `Response` has no
 * default type parameter — that makes an explicit type argument a `TS2558`
 * arity error instead of a silent collapse of the success type to `any`.
 */
export interface DefineTypedEventHandler {
  <
    const C extends readonly AnyCatalogue[],
    Response extends EventHandlerResponse,
    Request extends EventHandlerRequest = EventHandlerRequest,
  >(
    options: ConflictGuard<C> & { errors: C },
    handler: TypedHandlerFn<Request, Response, UnionOfCatalogues<C>>
  ): TypedEventHandler<Request, Response, UnionOfCatalogues<C>>
}
