import type { NuxtError } from 'nuxt/app'
import type { MaybeRef } from 'vue'
import type { RouteMethod } from '../engine'
import type { KnownErrorsOfRoute } from '../index'
import type { TaggedError } from './tagged'

/**
 * Nitro's ordinary error body for a Known error: `message` is the tag and
 * `data` the Tagged error. A fetched `NuxtError`'s `data` is this whole body,
 * so the Tagged error sits at `error.data.data`.
 */
export interface KnownErrorBody<Variant extends TaggedError> {
  error: true
  url: string
  statusCode: number
  statusMessage: string
  message: string
  data: Variant
}

/**
 * The Request-failed variant: every failure a call can meet that is not one
 * of the route's Known errors - a network failure, an abort, a status nobody
 * declared, a body that is not a Tagged error. `status` is the response's,
 * and `undefined` when no response arrived.
 */
export interface RequestFailed {
  _tag: 'request-failed'
  status: number | undefined
  cause: NuxtError
}

/**
 * What a call that does not throw resolves to. A discriminated union:
 * `if (error) return` narrows `data` with no second guard.
 */
export type TryResult<T, E> =
  | { data: T; error: undefined }
  | { data: undefined; error: E }

// `Route extends string` because a fetch request may also be a `Request`
// object, which no route path can be read out of.
type DeclaredFor<
  Route,
  Method extends RouteMethod | Uppercase<RouteMethod>,
> = Route extends string ? KnownErrorsOfRoute<Route, Method> : never

/**
 * The error one call to a route can throw: Nuxt's error object with the
 * route's Known errors inside the body; `NuxtError<unknown>` for a route that
 * declares none.
 */
export type KnownErrorFor<
  Route,
  Method extends RouteMethod | Uppercase<RouteMethod> = 'get',
> = [DeclaredFor<Route, Method>] extends [never]
  ? NuxtError<unknown>
  : NuxtError<KnownErrorBody<Extract<DeclaredFor<Route, Method>, TaggedError>>>

/** What `matchError` takes: a `.try` error, or a fetched `NuxtError`. */
export type MatchableError = TaggedError | NuxtError<unknown>

/**
 * The variants a matchable error can be: a `.try` error is its own union; a
 * fetched `NuxtError` is its body's Known errors or the Request-failed
 * variant. Distributes over a union of either.
 */
export type VariantsOf<Failure> = Failure extends TaggedError
  ? Failure
  : Failure extends NuxtError<infer Body>
    ?
        | (Body extends KnownErrorBody<infer Variant> ? Variant : never)
        | RequestFailed
    : never

type TagOf<Variant> = Variant extends {
  readonly _tag: infer Tag extends string
}
  ? Tag
  : never

/** One arm per `_tag` a failure can carry, each handed its whole variant. */
export type ErrorArms<Variant> = {
  readonly [Tag in TagOf<Variant>]: (
    variant: Extract<Variant, { readonly _tag: Tag }>
  ) => void
}

/**
 * Called with a Tagged error whose `_tag` no arm names: a tag this call site
 * has not heard of, such as one a newer server sends after a deploy.
 */
export type UnknownTagFallback = (unknown: TaggedError) => void

/**
 * Handles a failure: the arm for its `_tag`, or the fallback for a tag no arm
 * names. A nullish error is no failure, and nothing is called.
 */
// `void`, not a generic result: the arms are inferred from the error alone,
// and a result type parameter would be inferred from the arms instead.
export interface MatchError {
  // Generic over the whole failure, not its variants: inferring the variants
  // from one member of a union of failures would reject the call.
  <Failure extends MatchableError>(
    error: MaybeRef<Failure | null | undefined>,
    arms: ErrorArms<VariantsOf<Failure>>,
    fallback: UnknownTagFallback
  ): void
}
