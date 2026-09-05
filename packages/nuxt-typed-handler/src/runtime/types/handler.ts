import type { defineCheckedEventHandler } from '@dphonys/nuxt-handler-errors/server'
import type {
  CheckedEventHandler,
  ErrorDefinitions,
  ErrorDefinitionsGuard,
  ErrorFactories,
  ErrorsOfDefinitions,
  Fail,
  KnownError,
  KnownErrorsOf,
  KnownVariant,
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
  tag: 'validation-failed'
  status: 400
  issues: ValidationIssue[]
}

export type AnyKnownError = KnownError<KnownVariant>
type ErrorDeclaration = ErrorDefinitions | readonly AnyKnownError[]

type HasValidate<S extends ValidationSchemas> = [keyof S] extends [never]
  ? false
  : true

type HasErrors<A extends ErrorDeclaration> = A extends readonly AnyKnownError[]
  ? [A[number]] extends [never]
    ? false
    : true
  : [keyof A] extends [never]
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

/** Validated sources plus local `errors` factories (or legacy array-scoped `fail`). */
export type TypedContext<
  S extends ValidationSchemas,
  A extends ErrorDeclaration,
> = ValidatedContext<S> &
  (A extends ErrorDefinitions
    ? { readonly errors: ErrorFactories<A> }
    : A extends readonly AnyKnownError[]
      ? HasErrors<A> extends true
        ? { fail: Fail<KnownErrorsOf<A>> }
        : // eslint-disable-next-line ts/no-empty-object-type
          {}
      : never)

/** The declared union, plus the built-in variant when the route validates. */
export type TypedErrors<
  S extends ValidationSchemas,
  A extends ErrorDeclaration,
> =
  | (A extends ErrorDefinitions
      ? ErrorsOfDefinitions<A>
      : A extends readonly AnyKnownError[]
        ? KnownErrorsOf<A>
        : never)
  | (HasValidate<S> extends true ? ValidationFailed : never)

export type TypedHandlerFn<
  S extends ValidationSchemas,
  A extends ErrorDeclaration,
  Request extends EventHandlerRequest,
  Response,
> = (event: H3Event<Request>, ctx: TypedContext<S, A>) => Response

// Every guard below is a missing-property guard: an unsatisfiable property
// naming the mistake, surfaced by the compiler at the options argument.

/** Bare `{}` is a compile error: a route must declare something. */
export type AtLeastOne<
  S extends ValidationSchemas,
  A extends ErrorDeclaration,
> =
  HasValidate<S> extends true
    ? // eslint-disable-next-line ts/no-empty-object-type
      {}
    : HasErrors<A> extends true
      ? // eslint-disable-next-line ts/no-empty-object-type
        {}
      : { __declareSomething__: 'declare validate, errors, or both' }

/** `validation-failed` belongs to the built-in variant on every umbrella route. */
export type ReservedTagGuard<A extends ErrorDeclaration> =
  'validation-failed' extends (
    A extends readonly AnyKnownError[] ? KnownErrorsOf<A>['tag'] : keyof A
  )
    ? {
        __reservedErrorTag__: 'validation-failed is reserved for the built-in variant'
      }
    : // eslint-disable-next-line ts/no-empty-object-type
      {}

// The errors parent's `ConflictGuard`, read off its wrapper's options type
// because the parent's `/types` entry does not export the guard by name.
type ConflictGuard<A extends ReadonlyArray<AnyKnownError>> = Omit<
  Parameters<typeof defineCheckedEventHandler<A, EventHandlerResponse>>[0],
  'errors'
>

export type TypedHandlerOptions<
  S extends ValidationSchemas,
  A extends ReadonlyArray<AnyKnownError>,
> = AtLeastOne<S, A> &
  ReservedTagGuard<A> &
  ConflictGuard<A> & {
    validate?: S & ValidationSchemasGuard<S>
    errors?: A
  }

// Keep the legacy signature last for consumers extracting its parameter types.
export interface DefineTypedEventHandler {
  <
    // eslint-disable-next-line ts/no-empty-object-type
    const S extends ValidationSchemas = {},
    // Admit arrays to the generic constraint for legacy instantiation expressions;
    // the options conditional still excludes them from this overload.
    const D extends ErrorDefinitions | readonly AnyKnownError[] = never,
    Response extends EventHandlerResponse = EventHandlerResponse,
    Request extends EventHandlerRequest = EventHandlerRequest,
  >(
    options: {
      validate?: S & ValidationSchemasGuard<S>
      errors: D & ErrorDefinitionsGuard<Extract<D, ErrorDefinitions>>
    } & (D extends ErrorDefinitions ? unknown : never) &
      ReservedTagGuard<D> &
      AtLeastOne<S, D>,
    handler: TypedHandlerFn<S, Extract<D, ErrorDefinitions>, Request, Response>
  ): TypedEventHandler<
    Request,
    Response,
    TypedErrors<S, Extract<D, ErrorDefinitions>>,
    RequestInput<S>
  >

  <
    const S extends ValidationSchemas,
    Response extends EventHandlerResponse,
    Request extends EventHandlerRequest = EventHandlerRequest,
  >(
    options: {
      validate: S & ValidationSchemasGuard<S>
      errors?: never
    } & AtLeastOne<S, []>,
    handler: (event: H3Event<Request>, ctx: ValidatedContext<S>) => Response
  ): TypedEventHandler<Request, Response, ValidationFailed, RequestInput<S>>

  /** @deprecated Use a definition record and `throw errors.tag()`. */
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
