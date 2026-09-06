import type {
  CheckedEventHandler,
  AnyKnownError,
  ConflictGuard,
  HandlerContext,
  KnownErrorsOf,
} from '@dphonys/nuxt-handler-errors/types'
import type {
  RequestInput,
  ValidatedContext,
  ValidatedEventHandler,
  ValidationIssue,
  ValidationSchemas,
  ValidationSchemasGuard,
} from '@dphonys/nuxt-handler-validation/types'
import type { EventHandlerRequest, EventHandlerResponse, H3Event } from 'h3'

/** The built-in variant every validating route can fail with. */
export interface ValidationFailed {
  tag: 'validationFailed'
  status: 400
  issues: ValidationIssue[]
}

export type { AnyKnownError } from '@dphonys/nuxt-handler-errors/types'

type HasValidate<S extends ValidationSchemas> = [keyof S] extends [never]
  ? false
  : true

type HasErrors<A extends readonly AnyKnownError[]> = [A[number]] extends [never]
  ? false
  : true

/**
 * The handler `defineTypedEventHandler` returns: an ordinary h3
 * `EventHandler` carrying both parents' phantom slots, so each parent's
 * extractor reads its own.
 */
// Extends rather than restates: the validation slot is keyed on a private
// symbol.
export interface TypedEventHandler<
  Request extends EventHandlerRequest = EventHandlerRequest,
  Response extends EventHandlerResponse = EventHandlerResponse,
  Errors = never,
  Input = never,
>
  extends
    CheckedEventHandler<Request, Response, Errors>,
    ValidatedEventHandler<Request, Response, Input> {}

/** Validated sources plus factories for nonempty error declarations. */
export type TypedContext<
  S extends ValidationSchemas,
  A extends readonly AnyKnownError[],
> = ValidatedContext<S> &
  (HasErrors<A> extends true
    ? HandlerContext<A>
    : // eslint-disable-next-line ts/no-empty-object-type
      {})

/** The declared union, plus the built-in variant when the route validates. */
export type TypedErrors<
  S extends ValidationSchemas,
  A extends readonly AnyKnownError[],
> = KnownErrorsOf<A> | (HasValidate<S> extends true ? ValidationFailed : never)

export type TypedHandlerFn<
  S extends ValidationSchemas,
  A extends readonly AnyKnownError[],
  Request extends EventHandlerRequest,
  Response,
> = (event: H3Event<Request>, ctx: TypedContext<S, A>) => Response

// Every guard below is a missing-property guard: an unsatisfiable property
// naming the mistake, surfaced by the compiler at the options argument.

/** Bare `{}` is a compile error: a route must declare something. */
export type AtLeastOne<
  S extends ValidationSchemas,
  A extends readonly AnyKnownError[],
> =
  HasValidate<S> extends true
    ? // eslint-disable-next-line ts/no-empty-object-type
      {}
    : HasErrors<A> extends true
      ? // eslint-disable-next-line ts/no-empty-object-type
        {}
      : { __declareSomething__: 'declare validate, errors, or both' }

/** `validationFailed` belongs to the built-in variant on every umbrella route. */
export type ReservedTagGuard<A extends readonly AnyKnownError[]> =
  'validationFailed' extends KnownErrorsOf<A>['tag']
    ? {
        __reservedErrorTag__: 'validationFailed is reserved for the built-in variant'
      }
    : // eslint-disable-next-line ts/no-empty-object-type
      {}

export type TypedHandlerOptions<
  S extends ValidationSchemas,
  A extends ReadonlyArray<AnyKnownError>,
> = AtLeastOne<S, A> &
  ReservedTagGuard<A> &
  ConflictGuard<A> & {
    validate?: S & ValidationSchemasGuard<S>
    errors?: A
  }

export interface DefineTypedEventHandler {
  <
    // `{}` is the "declared nothing" default: no key, so no source and no
    // built-in variant.
    // eslint-disable-next-line ts/no-empty-object-type
    const S extends ValidationSchemas = {},
    const A extends ReadonlyArray<AnyKnownError> = [],
    Response extends EventHandlerResponse = EventHandlerResponse,
    Request extends EventHandlerRequest = EventHandlerRequest,
  >(
    options: TypedHandlerOptions<S, A>,
    handler: TypedHandlerFn<S, A, Request, Response>
  ): TypedEventHandler<Request, Response, TypedErrors<S, A>, RequestInput<S>>
}
