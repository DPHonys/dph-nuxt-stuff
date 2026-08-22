import type {
  KnownErrorFor,
  TryResult,
} from '@dphonys/nuxt-handler-errors/types'
import type { RouterMethod } from 'h3'
import type {
  $Fetch,
  AvailableRouterMethod,
  NitroFetchOptions,
  NitroFetchRequest,
  TypedInternalResponse,
} from 'nitropack/types'
import type { RequestInputOfRoute } from './index'

// Stack-depth rules, each a requirement on this file rather than a style:
// `M`'s default references only `R`; anything deriving a method from the
// options lives in an alias default, never in a signature parameter's
// constraint; `MatchedRoutes<R>` is evaluated once per lookup (inside
// `RequestInputOfRoute`); no type parameter appears in its own constraint.

/** The methods a call may name for a route: Nitro's, in either case. */
export type MethodArg<R extends NitroFetchRequest> =
  | AvailableRouterMethod<R>
  | Uppercase<AvailableRouterMethod<R>>

/** `get` when the route has one, else whatever it has - Nuxt's own rule. */
export type DefaultMethod<R extends NitroFetchRequest> =
  'get' extends MethodArg<R> ? 'get' : MethodArg<R>

// `R extends string` because `NitroFetchRequest` also admits a `Request`
// object no route path can be read out of - it degrades to no declared
// inputs.
type InputFor<R, M extends string> = R extends string
  ? RequestInputOfRoute<R, Extract<Lowercase<M>, RouterMethod>>
  : never

/** Required iff `{} extends Input` is false: an all-optional, `unknown` or `any` input stays optional but typed. */
type Declared<I, K extends keyof I> =
  // eslint-disable-next-line ts/no-empty-object-type
  {} extends I[K] ? { [P in K]?: I[K] } : { [P in K]-?: I[K] }

/** ofetch's own typing of one key, for a source nobody declared. */
type Vanilla<K extends 'body' | 'query'> = Pick<NitroFetchOptions<string>, K>

type QueryOption<I> = [I] extends [never]
  ? Vanilla<'query'>
  : 'query' extends keyof I
    ? Declared<I, 'query'>
    : Vanilla<'query'>

// An unbranded route keeps vanilla's `body` on every method, so the
// degradation stays key for key; a branded route omits it - neither typed nor
// vanilla - when the resolved method is `get` or `head`.
type BodyOption<I, M extends string> = [I] extends [never]
  ? Vanilla<'body'>
  : Lowercase<M> extends 'get' | 'head'
    ? // eslint-disable-next-line ts/no-empty-object-type
      {}
    : 'body' extends keyof I
      ? Declared<I, 'body'>
      : Vanilla<'body'>

/** The typed sources alone - what the composables re-add reactive. */
export type TypedSources<
  R extends NitroFetchRequest,
  M extends MethodArg<R>,
> = QueryOption<InputFor<R, M>> & BodyOption<InputFor<R, M>, M>

/**
 * The options every member of the Typed fetch family takes for a route and
 * method: vanilla's, with `body` and `query` typed from the route's declared
 * schemas and ofetch's deprecated `params` alias gone for everyone.
 */
export type TypedRequestOptions<
  R extends NitroFetchRequest,
  M extends MethodArg<R>,
> = Omit<
  NitroFetchOptions<R, Extract<Lowercase<M>, AvailableRouterMethod<R>>>,
  'method' | 'body' | 'query' | 'params'
> & { method?: M } & TypedSources<R, M>

/** Nitro's typed response for the route, method and explicit `T`. */
export type Resp<R, T, M extends string> = TypedInternalResponse<
  R,
  T,
  Extract<Lowercase<M>, RouterMethod>
>

/**
 * The error one call can produce - the errors parent's reading of the
 * known-errors map, which already carries `validation-failed` for every
 * validating route.
 */
export type TypedErrorFor<R, M extends string> = KnownErrorFor<
  R,
  Extract<Lowercase<M>, RouterMethod>
>

/** The `.try` call: returns a {@link TryResult} instead of throwing. */
export interface TypedFetchTry<
  DefaultT = unknown,
  DefaultR extends NitroFetchRequest = NitroFetchRequest,
> {
  <
    T = DefaultT,
    R extends NitroFetchRequest = DefaultR,
    const M extends MethodArg<R> = DefaultMethod<R>,
  >(
    request: R,
    opts?: TypedRequestOptions<R, M>
  ): Promise<TryResult<Resp<R, T, M>, TypedErrorFor<R, M>>>
}

/**
 * The minimal typed instance: the call plus `.try`. Every instance satisfies
 * it - the global, a created instance, and the event-bound one.
 */
export interface TypedFetch<
  DefaultT = unknown,
  DefaultR extends NitroFetchRequest = NitroFetchRequest,
> {
  <
    T = DefaultT,
    R extends NitroFetchRequest = DefaultR,
    const M extends MethodArg<R> = DefaultMethod<R>,
  >(
    request: R,
    opts?: TypedRequestOptions<R, M>
  ): Promise<Resp<R, T, M>>
  try: TypedFetchTry<DefaultT, DefaultR>
}

/** What `event.$typedFetch` is typed as: the seam exactly, no `.raw`, `.create` or `.native`. */
export type TypedEventFetch = TypedFetch

// ofetch's `FetchOptions` and `FetchResponse`, indexed out of Nitro's own
// signatures rather than imported from a package this module does not
// depend on.
type FetchDefaults = Parameters<$Fetch['create']>[0]
type RawResponse<T> = Omit<Awaited<ReturnType<$Fetch['raw']>>, '_data'> & {
  _data?: T
}

/** The `$typedFetch` global: a full mirror of vanilla's namespace plus `.try`. */
export interface $TypedFetch<
  DefaultT = unknown,
  DefaultR extends NitroFetchRequest = NitroFetchRequest,
> extends TypedFetch<DefaultT, DefaultR> {
  /** Shares the call's signature; no `.try`, it already returns without throwing. */
  raw: <
    T = DefaultT,
    R extends NitroFetchRequest = DefaultR,
    const M extends MethodArg<R> = DefaultMethod<R>,
  >(
    request: R,
    opts?: TypedRequestOptions<R, M>
  ) => Promise<RawResponse<Resp<R, T, M>>>

  /** ofetch's bare `fetch`, passed through untouched. */
  native: typeof globalThis.fetch

  /**
   * Like `$fetch.create`: a derived instance with defaults, keeping `.try`.
   * Defaults are vanilla ofetch options, not route-scoped: a default `query`
   * never relaxes a call's own requiredness.
   */
  // Must return the *typed* interface, or `.try` vanishes one level down.
  create: <T = DefaultT, R extends NitroFetchRequest = DefaultR>(
    defaults: FetchDefaults
  ) => $TypedFetch<T, R>
}
