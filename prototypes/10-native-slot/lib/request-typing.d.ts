// PROTOTYPE (ticket 10). Our map and the fetch family's request/response
// typing: variant C from `nuxt-typed-handler/src/runtime/types/fetch.ts`
// renamed to the `Better` vocabulary, with the spec's exhaustive `.try`.
// Every Nitro type arrives through ./engine.
import type { NuxtError } from 'nuxt/app'
import type {
  FetchDefaults,
  FetchRequest,
  RawFetchResponse,
  ResponseOf,
  RouteKeyOf,
  RouteMethod,
  RouteMethodOf,
  VanillaFetchOptions,
} from './engine'

// Stack-depth rules (August ticket 06): `M`'s default references only `R`; a
// method derived from options lives in an alias default, never a signature
// parameter's constraint; `RouteKeyOf<R>` once per lookup; no type parameter
// in its own constraint.

/** Reopened by the generated template. */
export interface KnownApiRequestInputs {}
/** Reopened by the generated template. */
export interface KnownApiErrors {}

type AnyMethod = RouteMethod | Uppercase<RouteMethod>

type RouteEntry<Map, R extends string, M extends AnyMethod> =
  RouteKeyOf<R> extends infer Key
    ? Key extends keyof Map
      ? Lowercase<M> extends keyof Map[Key]
        ? Map[Key][Lowercase<M>]
        : 'default' extends keyof Map[Key]
          ? Map[Key]['default']
          : never
      : never
    : never

export type RequestInputOfRoute<
  R extends string,
  M extends AnyMethod = 'get',
> = RouteEntry<KnownApiRequestInputs, R, M>

export type KnownErrorsOfRoute<
  R extends string,
  M extends AnyMethod = 'get',
> = RouteEntry<KnownApiErrors, R, M>

/** The methods a call may name for a route: Nitro's, in either case. */
export type MethodArg<R extends FetchRequest> =
  | RouteMethodOf<R>
  | Uppercase<RouteMethodOf<R>>

export type DefaultMethod<R extends FetchRequest> =
  'get' extends MethodArg<R> ? 'get' : MethodArg<R>

type Lower<M extends string> = Extract<Lowercase<M>, RouteMethod>

type InputFor<R, M extends string> = R extends string
  ? RequestInputOfRoute<R, Lower<M>>
  : never

type Declared<I, K extends keyof I> =
  // eslint-disable-next-line ts/no-empty-object-type
  {} extends I[K] ? { [P in K]?: I[K] } : { [P in K]-?: I[K] }

type Vanilla<K extends 'body' | 'query'> = Pick<VanillaFetchOptions<string>, K>

type QueryOption<I> = [I] extends [never]
  ? Vanilla<'query'>
  : 'query' extends keyof I
    ? Declared<I, 'query'>
    : Vanilla<'query'>

type BodyOption<I, M extends string> = [I] extends [never]
  ? Vanilla<'body'>
  : Lowercase<M> extends 'get' | 'head'
    ? // eslint-disable-next-line ts/no-empty-object-type
      {}
    : 'body' extends keyof I
      ? Declared<I, 'body'>
      : Vanilla<'body'>

export type RequestSources<
  R extends FetchRequest,
  M extends MethodArg<R>,
> = QueryOption<InputFor<R, M>> & BodyOption<InputFor<R, M>, M>

export type BetterRequestOptions<
  R extends FetchRequest,
  M extends MethodArg<R>,
> = Omit<
  VanillaFetchOptions<R, Extract<Lowercase<M>, RouteMethodOf<R>>>,
  'method' | 'body' | 'query' | 'params'
> & { method?: M } & RequestSources<R, M>

export type ResponseFor<R, T, M extends string> = ResponseOf<R, T, Lower<M>>

// ---------------------------------------------------------------------------
// The exhaustive `.try` (spec, "Client")
// ---------------------------------------------------------------------------

/** The client catch-all: every failure that is not a declared variant. */
export interface RequestFailed {
  _tag: 'request-failed'
  status: number | undefined
  cause: NuxtError
}

type KnownErrorsForCall<R, M extends string> = R extends string
  ? KnownErrorsOfRoute<R, Lower<M>>
  : never

/** `.try`'s error: the route's declared variants plus `request-failed`. */
export type TryErrorFor<R, M extends string> =
  | KnownErrorsForCall<R, M>
  | RequestFailed

export type TryResult<T, E> =
  | { data: T; error: undefined }
  | { data: undefined; error: E }

/** What thrown errors and composable error refs carry under `data`. */
export type KnownErrorFor<R, M extends string> = NuxtError<
  KnownErrorsForCall<R, M>
>

export interface BetterFetchTry<
  DefaultT = unknown,
  DefaultR extends FetchRequest = FetchRequest,
> {
  <
    T = DefaultT,
    R extends FetchRequest = DefaultR,
    const M extends MethodArg<R> = DefaultMethod<R>,
  >(
    request: R,
    opts?: BetterRequestOptions<R, M>
  ): Promise<TryResult<ResponseFor<R, T, M>, TryErrorFor<R, M>>>
}

export interface BetterFetch<
  DefaultT = unknown,
  DefaultR extends FetchRequest = FetchRequest,
> {
  <
    T = DefaultT,
    R extends FetchRequest = DefaultR,
    const M extends MethodArg<R> = DefaultMethod<R>,
  >(
    request: R,
    opts?: BetterRequestOptions<R, M>
  ): Promise<ResponseFor<R, T, M>>
  try: BetterFetchTry<DefaultT, DefaultR>
}

export interface $BetterFetch<
  DefaultT = unknown,
  DefaultR extends FetchRequest = FetchRequest,
> extends BetterFetch<DefaultT, DefaultR> {
  raw: <
    T = DefaultT,
    R extends FetchRequest = DefaultR,
    const M extends MethodArg<R> = DefaultMethod<R>,
  >(
    request: R,
    opts?: BetterRequestOptions<R, M>
  ) => Promise<RawFetchResponse<ResponseFor<R, T, M>>>
  native: typeof globalThis.fetch
  create: <T = DefaultT, R extends FetchRequest = DefaultR>(
    defaults: FetchDefaults
  ) => $BetterFetch<T, R>
}

declare global {
  // eslint-disable-next-line vars-on-top
  var $betterFetch: $BetterFetch
}
