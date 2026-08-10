import type { RouterMethod } from 'h3'
import type {
  $Fetch,
  Base$Fetch,
  ExtractedRouteMethod,
  NitroFetchOptions,
  NitroFetchRequest,
  TypedInternalResponse,
} from 'nitropack/types'
import type { NuxtError } from 'nuxt/app'
import type { KnownErrorBody } from '../shared/wire'
import type { KnownErrorsOfRoute } from './index'
import type { KnownVariant } from './known-error'

// ofetch's `FetchOptions`, indexed out of Nitro's own `create` signature
// rather than imported from a package we do not depend on.
type FetchDefaults = Parameters<$Fetch['create']>[0]

// `R extends string` because `NitroFetchRequest` also admits a `Request`
// object no route path can be read out of.
type KnownErrorsForCall<R, M extends RouterMethod> = R extends string
  ? KnownErrorsOfRoute<R, M>
  : never

/**
 * The error one call can produce: the framework's error object with the
 * route's declared union under `data`; `NuxtError<unknown>` for routes
 * declaring nothing.
 */
export type KnownErrorFor<
  R,
  M extends RouterMethod,
  Declared = KnownErrorsForCall<R, M>,
> = [Declared] extends [never]
  ? NuxtError<unknown>
  : NuxtError<KnownErrorBody<Extract<Declared, KnownVariant>>>

/**
 * What `.try` resolves to. A discriminated union: `if (error) return`
 * narrows `data` with no second guard.
 */
export type TryResult<T, E> =
  | { data: T; error: undefined }
  | { data: undefined; error: E }

// The method is a defaulted parameter of an ALIAS, never of the call
// signature: a constrained signature parameter is checked eagerly with `R`/`O`
// unresolved, emitting one `TS2321 Excessive stack depth` per `InternalApi`
// key.
type TryResultFor<
  R extends NitroFetchRequest,
  T,
  O extends NitroFetchOptions<R>,
  M = NitroFetchOptions<R> extends O ? 'get' : ExtractedRouteMethod<R, O>,
> = TryResult<
  TypedInternalResponse<R, T, Extract<M, RouterMethod>>,
  KnownErrorFor<R, Extract<M, RouterMethod>>
>

/** The `.try` call: returns a {@link TryResult} instead of throwing. */
export interface CheckedFetchTry<
  DefaultT = unknown,
  DefaultR extends NitroFetchRequest = NitroFetchRequest,
> {
  <
    T = DefaultT,
    R extends NitroFetchRequest = DefaultR,
    O extends NitroFetchOptions<R> = NitroFetchOptions<R>,
  >(
    request: R,
    opts?: O
  ): Promise<TryResultFor<R, T, O>>
}

/**
 * The minimal checked instance: vanilla's call plus `.try`. Every instance
 * satisfies it - the app global, a created instance, and the event-bound one.
 */
export interface CheckedFetch<
  DefaultT = unknown,
  DefaultR extends NitroFetchRequest = NitroFetchRequest,
> extends Base$Fetch<DefaultT, DefaultR> {
  try: CheckedFetchTry<DefaultT, DefaultR>
}

/** The `$checkedFetch` global: a full mirror of vanilla's namespace plus `.try`. */
export interface $CheckedFetch<
  DefaultT = unknown,
  DefaultR extends NitroFetchRequest = NitroFetchRequest,
> extends CheckedFetch<DefaultT, DefaultR> {
  /** No `.try`: it already returns a `FetchResponse` without throwing. */
  raw: $Fetch<DefaultT, DefaultR>['raw']

  /** ofetch's bare `fetch`, passed through untouched. */
  native: typeof globalThis.fetch

  /** Like `$fetch.create`: a derived instance with defaults, keeping `.try`. */
  // Must return the *checked* interface, or `.try` vanishes one level down.
  create: <T = DefaultT, R extends NitroFetchRequest = DefaultR>(
    defaults: FetchDefaults
  ) => $CheckedFetch<T, R>
}
