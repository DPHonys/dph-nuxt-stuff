import type { UseCheckedAsyncData } from '@dphonys/nuxt-handler-errors/internals/app'
import type { NitroFetchRequest } from 'nitropack/types'
import type { AsyncData, UseFetchOptions } from 'nuxt/app'
import type { MaybeRefOrGetter, Ref } from 'vue'
import type {
  DefaultMethod,
  MethodArg,
  Resp,
  TypedErrorFor,
  TypedSources,
} from './fetch'

// Nuxt does not export `ComputedOptions`; this is its definition verbatim -
// the bare `Function` included, because narrowing it would stop matching what
// vanilla's own option types accept.
type ComputedOptions<T extends Record<string, any>> = {
  // eslint-disable-next-line ts/no-unsafe-function-type
  [K in keyof T]: T[K] extends Function
    ? T[K]
    : ComputedOptions<T[K]> | MaybeRefOrGetter<T[K]>
}

type Reactive<T> =
  T extends Record<string, any>
    ? ComputedOptions<T> | MaybeRefOrGetter<T>
    : MaybeRefOrGetter<T>

// Each typed source re-added the way vanilla types its own. A plain literal
// is still excess-key checked; through `ref()` or a getter it is not - a
// union target, and `ref()` infers its own type.
type ReactiveSources<O> = { [K in keyof O]: Reactive<O[K]> }

/**
 * Vanilla `useFetch`'s options for a route and method, with `body` and
 * `query` typed from the route's declared schemas and `params` gone.
 */
export type UseTypedFetchOptions<
  ResT,
  ReqT extends NitroFetchRequest,
  Method extends MethodArg<ReqT>,
> = Omit<
  UseFetchOptions<ResT, ResT, never, undefined, ReqT, Method>,
  'body' | 'query' | 'params'
> &
  ReactiveSources<TypedSources<ReqT, Method>>

/**
 * `useFetch` with the route's Request input typed on the options and its
 * declared error union typed on the `error` ref.
 */
export interface UseTypedFetch {
  <
    ReqT extends NitroFetchRequest,
    const Method extends MethodArg<ReqT> = DefaultMethod<ReqT>,
    ResT = Resp<ReqT, unknown, Method>,
  >(
    request: Ref<ReqT> | ReqT | (() => ReqT),
    opts?: UseTypedFetchOptions<ResT, ReqT, Method>
  ): AsyncData<ResT | undefined, TypedErrorFor<ReqT, Method> | undefined>
}

/**
 * `useAsyncData` whose handler returns `.try` results instead of throwing.
 * The parent's signature exactly: the inner `$typedFetch.try` call types its
 * own options, and its error union is what lands on the `error` ref.
 */
export type UseTypedAsyncData = UseCheckedAsyncData
