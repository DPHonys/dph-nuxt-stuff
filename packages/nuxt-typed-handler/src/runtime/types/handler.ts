import type {
  CheckedEventHandler,
  AnyKnownError,
  ConflictGuard,
  HandlerContext,
  KnownErrorsOf,
} from '@dphonys/nuxt-handler-errors/types'
import type {
  DeclareSomething,
  HandlerReturn,
  RequestInput,
  ResponseOutput,
  ResponseOutputs,
  SentResponse,
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

export type { AnyKnownError } from '@dphonys/nuxt-handler-errors/types'

type HasInput<S extends ValidationSchemas> = [keyof S] extends [never]
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
  Output = never,
>
  extends
    CheckedEventHandler<Request, Response, Errors>,
    ValidatedEventHandler<Request, Response, Input, Output> {}

/**
 * Validated sources - plus `respond` when the Response output is a status map
 * - and factories for nonempty error declarations.
 */
export type TypedContext<
  S extends ValidationSchemas,
  A extends readonly AnyKnownError[],
  O = undefined,
> = ValidatedContext<S, O> &
  (HasErrors<A> extends true
    ? HandlerContext<A>
    : // eslint-disable-next-line ts/no-empty-object-type
      {})

/** The declared union, plus the built-in variant when the route validates. */
export type TypedErrors<
  S extends ValidationSchemas,
  A extends readonly AnyKnownError[],
> = KnownErrorsOf<A> | (HasInput<S> extends true ? ValidationFailed : never)

export type TypedHandlerFn<
  S extends ValidationSchemas,
  A extends readonly AnyKnownError[],
  Request extends EventHandlerRequest,
  Response,
  O = undefined,
> = (event: H3Event<Request>, ctx: TypedContext<S, A, O>) => Response

// Every guard below is a missing-property guard: an unsatisfiable property
// naming the mistake, surfaced by the compiler at the options argument.

/**
 * Bare `{}` is a compile error: a route must declare something. The two halves
 * the validation parent owns are its guard's to judge, composed here with the
 * umbrella's own sentence; `errors` is the half this package adds.
 */
export type AtLeastOne<
  S extends ValidationSchemas,
  A extends readonly AnyKnownError[],
  O,
> =
  HasErrors<A> extends true
    ? // eslint-disable-next-line ts/no-empty-object-type
      {}
    : DeclareSomething<
        S,
        O,
        'declare input, errors, output, or any combination'
      >

/** `validation-failed` belongs to the built-in variant on every umbrella route. */
export type ReservedTagGuard<A extends readonly AnyKnownError[]> =
  'validation-failed' extends KnownErrorsOf<A>['tag']
    ? {
        __reservedErrorTag__: 'validation-failed is reserved for the built-in variant'
      }
    : // eslint-disable-next-line ts/no-empty-object-type
      {}

export type TypedHandlerOptions<
  S extends ValidationSchemas,
  A extends ReadonlyArray<AnyKnownError>,
  O,
> = AtLeastOne<S, A, O> &
  ReservedTagGuard<A> &
  ConflictGuard<A> & {
    input?: S & ValidationSchemasGuard<S>
    errors?: A
    output?: O
  }

export interface DefineTypedEventHandler {
  <
    // `{}` is the "declared nothing" default: no key, so no source and no
    // built-in variant. `undefined` is the same default for the Response
    // output, and the response constraint reads `unknown` behind it.
    // eslint-disable-next-line ts/no-empty-object-type
    const S extends ValidationSchemas = {},
    const A extends ReadonlyArray<AnyKnownError> = [],
    O extends ResponseOutput | undefined = undefined,
    Response extends EventHandlerResponse<HandlerReturn<O>> =
      EventHandlerResponse<HandlerReturn<O>>,
    Request extends EventHandlerRequest = EventHandlerRequest,
  >(
    options: TypedHandlerOptions<S, A, O>,
    handler: TypedHandlerFn<S, A, Request, Response, O>
  ): TypedEventHandler<
    Request,
    SentResponse<O, Response>,
    TypedErrors<S, A>,
    RequestInput<S>,
    ResponseOutputs<O>
  >
}
