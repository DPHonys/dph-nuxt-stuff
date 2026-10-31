/**
 * The composables' types: `useBetterFetch` with the fetch family's Request
 * typing re-added reactive, and `useBetterAsyncData`, whose handler returns a
 * `.try` result. Written against what Nuxt 4.0 and the latest 4.x both
 * declare: Nuxt's `AsyncDataHandler` and `AsyncDataOptionsWithTransform` are
 * 4.6's alone.
 */

import type {
  AsyncData,
  AsyncDataOptions,
  useAsyncData as nuxtUseAsyncData,
} from 'nuxt/app'
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { FetchRequest, VanillaUseFetchOptions } from './engine'
import type {
  KnownErrorFor,
  KnownErrorOf,
  RequestFailed,
} from './errors/client'
import type { TaggedError } from './errors/tagged'
import type {
  BetterFetch,
  BetterResponse,
  DefaultMethod,
  MethodArg,
  RequestSources,
} from './fetch'

// Nuxt does not export `ComputedOptions`; this is its definition verbatim,
// the bare `Function` included, because narrowing it would stop matching what
// vanilla's own option types accept.
type ComputedOptions<T extends Record<string, any>> = {
  // eslint-disable-next-line ts/no-unsafe-function-type -- Nuxt's own definition
  [K in keyof T]: T[K] extends Function
    ? T[K]
    : ComputedOptions<T[K]> | MaybeRefOrGetter<T[K]>
}

// `object` is what vanilla's `Record<string, any>` bound admits, every
// non-primitive, spelled without the open dictionary.
type Reactive<T> = T extends object
  ? ComputedOptions<T> | MaybeRefOrGetter<T>
  : MaybeRefOrGetter<T>

// Each typed source re-added the way vanilla types its own. A plain literal
// is still excess-key checked; through `ref()` or a getter it is not: the
// target is a union, and `ref()` infers its own type.
type ReactiveSources<O> = { [K in keyof O]: Reactive<O[K]> }

/**
 * `useFetch`'s options for a route and method: Nuxt's own, with `body`,
 * `query` and `headers` typed as the fetch family types them and each
 * accepted plain, through a ref or through a getter, `params` gone, and the
 * method in either case.
 */
export type UseBetterFetchOptions<
  ResT,
  ReqT extends FetchRequest,
  Method extends MethodArg<ReqT>,
> = Omit<
  VanillaUseFetchOptions<ResT, ReqT, Method>,
  // `method` is restated rather than kept: Nuxt 4.6's own spelling, through
  // its route engine, reports an excessive stack depth at the call site on
  // Nitro's route types.
  'method' | 'body' | 'query' | 'headers' | 'params'
> & { method?: Method } & ReactiveSources<RequestSources<ReqT, Method>>

/**
 * `useFetch` with the route's Request input typed on the options, its
 * response on `data`, and its Known errors in the body of the `error` ref.
 */
export interface UseBetterFetch {
  <
    ReqT extends FetchRequest,
    const Method extends MethodArg<ReqT> = DefaultMethod<ReqT>,
    ResT = BetterResponse<ReqT, unknown, Method>,
  >(
    request: Ref<ReqT> | ReqT | (() => ReqT),
    opts?: UseBetterFetchOptions<ResT, ReqT, Method>
  ): AsyncData<ResT | undefined, KnownErrorFor<ReqT, Method> | undefined>
}

/**
 * What a `useBetterAsyncData` handler is handed: whatever the installed
 * Nuxt hands vanilla's handler, read off vanilla's own signature, so a
 * handler written for vanilla fits as it is.
 */
type NuxtHandlerArgs = Parameters<Parameters<typeof nuxtUseAsyncData>[1]>

/** A `useBetterAsyncData` handler: vanilla's, resolving to `T`. */
export type BetterAsyncDataHandler<T> = (...args: NuxtHandlerArgs) => Promise<T>

/**
 * What a handler must resolve to: a `.try` result, `{ data, error }` with
 * `error` a Tagged error or `undefined`.
 */
export interface TrySource {
  data: unknown
  error: TaggedError | undefined
}

/** The success half of a `.try` result: what vanilla calls `ResT`. */
export type SuccessOf<Result> = Result extends {
  error: undefined
  data: infer Data
}
  ? Data
  : never

/** The failure half: every variant the result can carry, as a union. */
export type FailureOf<Result> = Result extends { error: infer Failure }
  ? NonNullable<Failure>
  : never

/**
 * The `error` ref of a `useBetterAsyncData` call: Nuxt's error object the
 * failed fetch threw, the handler's Known errors inside its body.
 */
export type AsyncDataErrorOf<Result> = KnownErrorOf<
  Exclude<FailureOf<Result>, RequestFailed>
>

/**
 * Why a handler is refused: it does not resolve to a `.try` result. The
 * diagnostic prints at what the handler returns, with this sentence inside
 * it.
 */
export interface AsyncDataHandlerError<Msg extends string> {
  readonly 'async-data-handler-error': Msg
}

// `unknown`, the identity of `&`, for a `.try` result; the unsatisfiable
// property otherwise. Not a constraint on `Result`: a constraint is the
// contextual type of what the handler returns, from which a bare
// `$betterFetch` call infers its response type - while the route is still
// being inferred, with an excessive stack depth. Nor a check intersected
// with the handler: resolving it to find the handler's parameters fixes
// `Result` before a handler that names its parameters is read.
type TryResultCheck<Result> = [Result] extends [TrySource]
  ? unknown
  : AsyncDataHandlerError<'resolve to a .try result, such as $betterFetch.try(…)'>

/** A handler as `useBetterAsyncData` takes it, its result checked. */
type CheckedHandler<Result> = BetterAsyncDataHandler<
  Result & TryResultCheck<Result>
>

// Nuxt's `KeysOf`, read off the `pick` option of its own `AsyncDataOptions`,
// as Nuxt 4.0 exports neither it nor `PickFrom` from `nuxt/app`.
type KeysOf<T> = NonNullable<AsyncDataOptions<unknown, T>['pick']>

// Nuxt's `PickFrom`, with its `any`s spelled as what they admit: an array
// and any object are handed back whole unless keys are picked off an object.
type PickFrom<T, K extends Array<string>> =
  KeysOf<T> extends K
    ? T
    : T extends readonly unknown[]
      ? T
      : T extends object
        ? keyof T extends K[number]
          ? T
          : K[number] extends never
            ? T
            : Pick<T, Extract<K[number], keyof T>>
        : T

/** What one `useBetterAsyncData` call answers. */
type BetterAsyncData<
  Result,
  DataT,
  PickKeys extends KeysOf<DataT>,
  DefaultT,
> = AsyncData<
  PickFrom<DataT, PickKeys> | DefaultT,
  AsyncDataErrorOf<Result> | undefined
>

/** The options of one `useBetterAsyncData` call: vanilla's, over the success. */
type BetterAsyncDataOptions<
  Result,
  DataT,
  PickKeys extends KeysOf<DataT>,
  DefaultT,
> = AsyncDataOptions<SuccessOf<Result>, DataT, PickKeys, DefaultT>

/**
 * `useAsyncData` whose handler resolves to a `.try` result instead of
 * throwing: `data` is the unwrapped success, and `transform`, `pick` and
 * `default` see it, never the result; the `error` ref is the `NuxtError` the
 * failed fetch threw, the handler's Known errors in its body. Vanilla's own
 * overloads, keyless and keyed, with the handler's result swapped for its
 * success. A handler resolving to anything but a `.try` result is refused,
 * so forgetting `.try` is a compile error.
 */
export interface UseBetterAsyncData {
  <
    Result,
    DataT = SuccessOf<Result>,
    PickKeys extends KeysOf<DataT> = KeysOf<DataT>,
    DefaultT = undefined,
  >(
    handler: CheckedHandler<Result>,
    options?: BetterAsyncDataOptions<Result, DataT, PickKeys, DefaultT>
  ): BetterAsyncData<Result, DataT, PickKeys, DefaultT>

  <
    Result,
    DataT = SuccessOf<Result>,
    PickKeys extends KeysOf<DataT> = KeysOf<DataT>,
    DefaultT = DataT,
  >(
    handler: CheckedHandler<Result>,
    options?: BetterAsyncDataOptions<Result, DataT, PickKeys, DefaultT>
  ): BetterAsyncData<Result, DataT, PickKeys, DefaultT>

  <
    Result,
    DataT = SuccessOf<Result>,
    PickKeys extends KeysOf<DataT> = KeysOf<DataT>,
    DefaultT = undefined,
  >(
    key: MaybeRefOrGetter<string>,
    handler: CheckedHandler<Result>,
    options?: BetterAsyncDataOptions<Result, DataT, PickKeys, DefaultT>
  ): BetterAsyncData<Result, DataT, PickKeys, DefaultT>

  <
    Result,
    DataT = SuccessOf<Result>,
    PickKeys extends KeysOf<DataT> = KeysOf<DataT>,
    DefaultT = DataT,
  >(
    key: MaybeRefOrGetter<string>,
    handler: CheckedHandler<Result>,
    options?: BetterAsyncDataOptions<Result, DataT, PickKeys, DefaultT>
  ): BetterAsyncData<Result, DataT, PickKeys, DefaultT>
}

/**
 * `useRequestFetch`'s mirror: the fetch family bound to the request being
 * rendered, so a call forwards its cookies and headers, and the global in
 * the browser.
 */
export type UseRequestBetterFetch = () => BetterFetch
