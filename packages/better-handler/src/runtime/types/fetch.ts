/**
 * The fetch family's types: Request typing per `(route, method)` from the
 * generated `KnownApiRequestInputs` map, the response from Nitro's route
 * types, and `.try`'s error from the generated `KnownApiErrors` map. Every
 * Nitro type arrives through the response-typing seam (`./engine`).
 */

import type {
  FetchDefaults,
  FetchRequest,
  RawFetchResponse,
  ResponseOf,
  RouteMethod,
  RouteMethodOf,
  VanillaFetchOptions,
} from './engine'
import type { RequestFailed, TryResult } from './errors/client'
import type { KnownErrorsOfRoute, RequestInputOfRoute } from './index'

// Stack-depth rules, each one a `TS2321 Excessive stack depth` per route key
// when broken: `M`'s default references only `R`; a method derived from the
// options lives in an alias default, never in a signature parameter's
// constraint; the route lookup (`RouteKeyOf`) runs at most once per map
// lookup; no type parameter appears in its own constraint.

/** The methods a call may name for a route: Nitro's, in either case. */
export type MethodArg<R extends FetchRequest> =
  | RouteMethodOf<R>
  | Uppercase<RouteMethodOf<R>>

/** `get` when the route has one, else whatever it has: Nuxt's own rule. */
export type DefaultMethod<R extends FetchRequest> =
  'get' extends MethodArg<R> ? 'get' : MethodArg<R>

/** A method as the maps and Nitro key it: lowercase. */
type Lower<M extends string> = Extract<Lowercase<M>, RouteMethod>

// `R extends string` because a fetch request may also be a `Request` object,
// which no route path can be read out of.
type InputFor<R, M extends string> = R extends string
  ? RequestInputOfRoute<R, Lower<M>>
  : never

// Required only when the input cannot be omitted: an all-optional, `unknown`
// or `any` input stays optional but typed.
type Declared<I, K extends keyof I> =
  // eslint-disable-next-line ts/no-empty-object-type -- the requiredness test itself
  {} extends I[K] ? { [P in K]?: I[K] } : { [P in K]-?: I[K] }

/** ofetch's own typing of one key, for a source nobody declared. */
type Vanilla<K extends 'body' | 'query' | 'headers'> = Pick<
  VanillaFetchOptions<string>,
  K
>

/** One header as a request sends it. */
type HeaderRecord = Record<string, string>

// Declared headers are a record, never a `Headers` or a tuple list, whose
// keys the compiler cannot read. The declared keys are typed and other
// headers stay open: a client sends more than any route validates, and a
// headers schema reads only the keys it names.
type DeclaredHeaders<I, K extends keyof I> =
  // eslint-disable-next-line ts/no-empty-object-type -- the requiredness test itself
  {} extends I[K]
    ? { [P in K]?: I[K] & HeaderRecord }
    : { [P in K]-?: I[K] & HeaderRecord }

type QueryOption<I> = [I] extends [never]
  ? Vanilla<'query'>
  : 'query' extends keyof I
    ? Declared<I, 'query'>
    : Vanilla<'query'>

type HeadersOption<I> = [I] extends [never]
  ? Vanilla<'headers'>
  : 'headers' extends keyof I
    ? DeclaredHeaders<I, 'headers'>
    : Vanilla<'headers'>

// A route this package does not type keeps vanilla's `body` on every method;
// a route of this package has none at all on `get` and `head`.
type BodyOption<I, M extends string> = [I] extends [never]
  ? Vanilla<'body'>
  : Lowercase<M> extends 'get' | 'head'
    ? // eslint-disable-next-line ts/no-empty-object-type -- no `body` key at all
      {}
    : 'body' extends keyof I
      ? Declared<I, 'body'>
      : Vanilla<'body'>

/** The typed sources alone, `body`, `query` and `headers`. */
type RequestSources<
  R extends FetchRequest,
  M extends MethodArg<R>,
> = QueryOption<InputFor<R, M>> &
  BodyOption<InputFor<R, M>, M> &
  HeadersOption<InputFor<R, M>>

/**
 * The options every member of the fetch family takes for a route and method:
 * vanilla's, with `body`, `query` and `headers` typed from the route's
 * declared sources as their schemas' input types, and ofetch's deprecated
 * `params` alias gone for every route.
 *
 * A declared source is required unless sending nothing would pass its
 * schema, and a `body` or `query` key the schema does not name is refused.
 * Declared headers type the keys they name and leave other headers open. A
 * route of this package takes no `body` on `get` or `head`; a route it does
 * not type keeps vanilla's options key for key.
 */
export type BetterRequestOptions<
  R extends FetchRequest,
  M extends MethodArg<R>,
> = Omit<
  VanillaFetchOptions<R, Extract<Lowercase<M>, RouteMethodOf<R>>>,
  'method' | 'body' | 'query' | 'headers' | 'params'
> & { method?: M } & RequestSources<R, M>

/** What one call resolves to on success. */
export type BetterResponse<R, T, M extends string> = ResponseOf<R, T, Lower<M>>

type KnownErrorsFor<R, M extends string> = R extends string
  ? KnownErrorsOfRoute<R, Lower<M>>
  : never

/**
 * `.try`'s error for one call: the route's Known errors as they arrive, and
 * the Request-failed variant for every other failure. Exhaustive on `_tag`.
 */
export type BetterFetchError<R, M extends string> =
  | KnownErrorsFor<R, M>
  | RequestFailed

/** The `.try` call: resolves to a {@link TryResult} instead of throwing. */
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
  ): Promise<TryResult<BetterResponse<R, T, M>, BetterFetchError<R, M>>>
}

/**
 * The call and `.try`: what `event.$betterFetch` is, and what every other
 * member of the family extends. A rejected call throws the `NuxtError`
 * `KnownErrorFor` describes.
 */
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
  ): Promise<BetterResponse<R, T, M>>
  try: BetterFetchTry<DefaultT, DefaultR>
}

/** The `$betterFetch` global: vanilla's whole namespace plus `.try`. */
export interface $BetterFetch<
  DefaultT = unknown,
  DefaultR extends FetchRequest = FetchRequest,
> extends BetterFetch<DefaultT, DefaultR> {
  /** Shares the call's signature, and resolves to the whole response. */
  raw: <
    T = DefaultT,
    R extends FetchRequest = DefaultR,
    const M extends MethodArg<R> = DefaultMethod<R>,
  >(
    request: R,
    opts?: BetterRequestOptions<R, M>
  ) => Promise<RawFetchResponse<BetterResponse<R, T, M>>>

  /** ofetch's bare `fetch`, passed through untouched. */
  native: typeof globalThis.fetch

  /**
   * Like `$fetch.create`: a derived instance with defaults, keeping `.try`.
   * The defaults are vanilla options, so a default `query` never relaxes a
   * call's own requiredness.
   */
  // Returns the typed interface, or `.try` vanishes one level down.
  create: <T = DefaultT, R extends FetchRequest = DefaultR>(
    defaults: FetchDefaults
  ) => $BetterFetch<T, R>
}
