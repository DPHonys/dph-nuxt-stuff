// Stand-in for the umbrella's `defineTypedEventHandler` (tickets 05, 09): types only.
import type { EventHandlerRequest, EventHandlerResponse, H3Event } from 'h3'
import type { CheckedEventHandler, Fail } from '../../src/runtime/types'
import type { AnyKnownError, ConflictGuard, KnownErrorsOf, KnownVariant } from '../../src/runtime/types/known-error'
import type { RequestInput, ValidatedContext, ValidationIssue, ValidationSchemas } from './validation-types'

export interface ValidationFailed {
  tag: 'validation-failed'
  status: 400
  issues: ValidationIssue[]
}

/** Both parents' brands, intersected (ticket 03). */
export interface TypedEventHandler<
  Request extends EventHandlerRequest,
  Response extends EventHandlerResponse,
  Errors,
  Input,
> extends CheckedEventHandler<Request, Response, Errors> {
  __requestInput__?: Input
}

type ReservedTagGuard<A extends ReadonlyArray<AnyKnownError>> =
  'validation-failed' extends KnownErrorsOf<A>['tag']
    ? { __reservedErrorTag__: 'validation-failed is reserved for the built-in variant' }
    : {}

type HasValidate<S> = [keyof S] extends [never] ? false : true
type HasErrors<A extends ReadonlyArray<unknown>> = [A[number]] extends [never] ? false : true

type AtLeastOne<S, A extends ReadonlyArray<unknown>> =
  HasValidate<S> extends false
    ? HasErrors<A> extends false
      ? { __declareSomething__: 'declare validate, errors, or both' }
      : {}
    : {}

/** Flat Handler context: validated sources + `fail` iff `errors` declared. */
export type TypedContext<S extends ValidationSchemas, A extends ReadonlyArray<AnyKnownError>> =
  ValidatedContext<S> & (HasErrors<A> extends true ? { fail: Fail<KnownErrorsOf<A>> } : {})

export type TypedErrors<S, A extends ReadonlyArray<AnyKnownError>> =
  | KnownErrorsOf<A>
  | (HasValidate<S> extends true ? ValidationFailed : never)

export declare function defineTypedEventHandler<
  const S extends ValidationSchemas = {},
  const A extends ReadonlyArray<AnyKnownError> = [],
  Response extends EventHandlerResponse = EventHandlerResponse,
  Request extends EventHandlerRequest = EventHandlerRequest,
>(
  options: AtLeastOne<S, A> & ReservedTagGuard<A> & ConflictGuard<A> & { validate?: S; errors?: A },
  handler: (event: H3Event<Request>, ctx: TypedContext<S, A>) => Response
): TypedEventHandler<Request, Response, TypedErrors<S, A>, RequestInput<S>>

export type _KV = KnownVariant
