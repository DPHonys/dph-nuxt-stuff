// PROTOTYPE (ticket 10). `useBetterFetch`'s type: Nuxt's `UseFetchOptions`
// with `body`/`query`/`params` swapped out (typed/runtime/types/composables.ts).
import type { AsyncData, UseFetchOptions } from 'nuxt/app'
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { FetchRequest } from './engine'
import type {
  DefaultMethod,
  KnownErrorFor,
  MethodArg,
  RequestSources,
  ResponseFor,
} from './request-typing'

type ComputedOptions<T extends Record<string, any>> = {
  // eslint-disable-next-line ts/no-unsafe-function-type
  [K in keyof T]: T[K] extends Function
    ? T[K]
    : ComputedOptions<T[K]> | MaybeRefOrGetter<T[K]>
}

type Reactive<T> = T extends object
  ? ComputedOptions<T> | MaybeRefOrGetter<T>
  : MaybeRefOrGetter<T>

type ReactiveSources<O> = { [K in keyof O]: Reactive<O[K]> }

export type UseBetterFetchOptions<
  ResT,
  ReqT extends FetchRequest,
  Method extends MethodArg<ReqT>,
> = Omit<
  UseFetchOptions<ResT, ResT, never, undefined, ReqT & string, Method>,
  'method' | 'body' | 'query' | 'params'
> & { method?: Method } & ReactiveSources<RequestSources<ReqT, Method>>

export interface UseBetterFetch {
  <
    ReqT extends FetchRequest,
    const Method extends MethodArg<ReqT> = DefaultMethod<ReqT>,
    ResT = ResponseFor<ReqT, unknown, Method>,
  >(
    request: Ref<ReqT> | ReqT | (() => ReqT),
    opts?: UseBetterFetchOptions<ResT, ReqT, Method>
  ): AsyncData<ResT | undefined, KnownErrorFor<ReqT, Method> | undefined>
}

export declare const useBetterFetch: UseBetterFetch
