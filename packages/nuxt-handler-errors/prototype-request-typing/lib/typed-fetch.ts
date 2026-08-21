// Stand-in for the umbrella's `/types`: the request-inputs map and the typed-fetch family
// (ticket 06, variant C). `KnownErrorFor` / `TryResult` are reused from the errors parent.
import type { RouterMethod } from 'h3'
import type {
  $Fetch,
  AvailableRouterMethod,
  MatchedRoutes,
  NitroFetchOptions,
  NitroFetchRequest,
  TypedInternalResponse,
} from 'nitropack/types'
import type { AsyncData, AsyncDataOptions, NuxtError, UseFetchOptions } from 'nuxt/app'
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { KnownErrorFor, TryResult } from '../../src/runtime/types'

/** The generated map — reopened by `declare module` in generated/map.d.ts. */
export interface KnownApiRequestInputs {}

type LowerMethod = RouterMethod | Uppercase<RouterMethod>

/** Mirrors `KnownErrorsOfRoute`: `MatchedRoutes` once, `Lowercase<M>`, `'default'` by presence. */
export type RequestInputOfRoute<R extends string, M extends LowerMethod = 'get'> =
  MatchedRoutes<R> extends infer Key
    ? Key extends keyof KnownApiRequestInputs
      ? Lowercase<M> extends keyof KnownApiRequestInputs[Key]
        ? KnownApiRequestInputs[Key][Lowercase<M>]
        : 'default' extends keyof KnownApiRequestInputs[Key]
          ? KnownApiRequestInputs[Key]['default']
          : never
      : never
    : never

type InputFor<R, M extends string> = R extends string
  ? RequestInputOfRoute<R, Extract<Lowercase<M>, RouterMethod>>
  : never

export type MethodArg<R extends NitroFetchRequest> =
  | AvailableRouterMethod<R>
  | Uppercase<AvailableRouterMethod<R>>

type BodyAllowed<M extends string> = Lowercase<M> extends 'get' | 'head' ? false : true

/** Required iff `{} extends Input` is false. */
type Declared<I, K extends keyof I> = {} extends I[K] ? { [P in K]?: I[K] } : { [P in K]-?: I[K] }

type Vanilla<K extends 'body' | 'query'> = Pick<NitroFetchOptions<string>, K>

type QueryOption<I> = [I] extends [never]
  ? Vanilla<'query'>
  : 'query' extends keyof I ? Declared<I, 'query'> : Vanilla<'query'>

type BodyOption<I, M extends string> = BodyAllowed<M> extends false
  ? {}
  : [I] extends [never]
    ? Vanilla<'body'>
    : 'body' extends keyof I ? Declared<I, 'body'> : Vanilla<'body'>

/** The options every member of the family takes. `params` is gone for everyone. */
export type TypedRequestOptions<R extends NitroFetchRequest, M extends MethodArg<R>> =
  & Omit<NitroFetchOptions<R, Extract<Lowercase<M>, AvailableRouterMethod<R>>>, 'method' | 'body' | 'query' | 'params'>
  & { method?: M }
  & QueryOption<InputFor<R, M>>
  & BodyOption<InputFor<R, M>, M>

type DefaultMethod<R extends NitroFetchRequest> = 'get' extends MethodArg<R> ? 'get' : MethodArg<R>
type Resp<R, T, M extends string> = TypedInternalResponse<R, T, Extract<Lowercase<M>, RouterMethod>>

export interface TypedFetchTry<DefaultT = unknown, DefaultR extends NitroFetchRequest = NitroFetchRequest> {
  <T = DefaultT, R extends NitroFetchRequest = DefaultR, const M extends MethodArg<R> = DefaultMethod<R>>(
    request: R,
    opts?: TypedRequestOptions<R, M>
  ): Promise<TryResult<Resp<R, T, M>, KnownErrorFor<R, Extract<Lowercase<M>, RouterMethod>>>>
}

export interface TypedFetch<DefaultT = unknown, DefaultR extends NitroFetchRequest = NitroFetchRequest> {
  <T = DefaultT, R extends NitroFetchRequest = DefaultR, const M extends MethodArg<R> = DefaultMethod<R>>(
    request: R,
    opts?: TypedRequestOptions<R, M>
  ): Promise<Resp<R, T, M>>
  try: TypedFetchTry<DefaultT, DefaultR>
}

type FetchDefaults = Parameters<$Fetch['create']>[0]

export interface $TypedFetch<DefaultT = unknown, DefaultR extends NitroFetchRequest = NitroFetchRequest>
  extends TypedFetch<DefaultT, DefaultR> {
  raw: <T = DefaultT, R extends NitroFetchRequest = DefaultR, const M extends MethodArg<R> = DefaultMethod<R>>(
    request: R,
    opts?: TypedRequestOptions<R, M>
  ) => Promise<Awaited<ReturnType<$Fetch['raw']>> & { _data?: Resp<R, T, M> }>
  native: typeof globalThis.fetch
  /** Defaults are vanilla ofetch options — not route-scoped. */
  create: <T = DefaultT, R extends NitroFetchRequest = DefaultR>(defaults: FetchDefaults) => $TypedFetch<T, R>
}

// ---------------------------------------------------------------------------
// useTypedFetch — Nuxt's UseFetchOptions with the three keys swapped out
// ---------------------------------------------------------------------------

// Nuxt does not export `ComputedOptions`; this is its definition verbatim.
type ComputedOptions<T extends Record<string, any>> = {
  [K in keyof T]: T[K] extends Function ? T[K] : ComputedOptions<T[K]> | MaybeRefOrGetter<T[K]>
}
type Reactive<T> = T extends Record<string, any> ? ComputedOptions<T> | MaybeRefOrGetter<T> : MaybeRefOrGetter<T>
type ReactiveSources<O> = { [K in keyof O]: Reactive<O[K]> }

type TypedSources<R extends NitroFetchRequest, M extends MethodArg<R>> =
  QueryOption<InputFor<R, M>> & BodyOption<InputFor<R, M>, M>

export type UseTypedFetchOptions<ResT, ReqT extends NitroFetchRequest, Method extends MethodArg<ReqT>> =
  & Omit<UseFetchOptions<ResT, ResT, never, undefined, ReqT, Method>, 'body' | 'query' | 'params'>
  & ReactiveSources<TypedSources<ReqT, Method>>

export declare function useTypedFetch<
  ReqT extends NitroFetchRequest,
  const Method extends MethodArg<ReqT> = DefaultMethod<ReqT>,
  ResT = Resp<ReqT, unknown, Method>,
>(
  request: Ref<ReqT> | ReqT | (() => ReqT),
  opts?: UseTypedFetchOptions<ResT, ReqT, Method>
): AsyncData<ResT | undefined, KnownErrorFor<ReqT, Extract<Lowercase<Method>, RouterMethod>> | undefined>

export type _Unused = AsyncDataOptions<unknown> | NuxtError
