import { configuredChannelToken } from '#nuxt-handler-errors/channel-token'
import type { RouterMethod } from 'h3'
import type { AvailableRouterMethod, NitroFetchRequest } from 'nitropack/types'
import type { ComputedRef, Ref } from 'vue'
import { computed, toValue } from 'vue'
import type { AsyncData, FetchResult, NuxtError, UseFetchOptions } from '#app'
import { useFetch, useLazyFetch } from '#app'
import type { KeysOf, PickFrom } from '#app/composables/asyncData'
import type { UseFetchOptionsWithTransform } from '#app/composables/fetch'
import { CHANNEL_HEADER } from '../../shared/channel'
import type { KnownErrorBody } from '../../shared/wire'
import type { KnownErrorsOfRoute, KnownVariant } from '../../types'

type RouteMethod<R extends NitroFetchRequest> =
  | AvailableRouterMethod<R>
  | Uppercase<AvailableRouterMethod<R>>

// `ReqT extends string` because `NitroFetchRequest` also admits a `Request`
// object no route path can be read out of.
type KnownErrorsFor<ReqT, Method> = ReqT extends string
  ? Method extends RouterMethod | Uppercase<RouterMethod>
    ? KnownErrorsOfRoute<ReqT, Method>
    : never
  : never

/**
 * What the `error` ref holds: the framework's error object with the route's
 * declared union under `data`; `NuxtError<unknown>` for routes declaring
 * nothing.
 */
export type KnownErrorRef<
  ReqT,
  Method,
  Declared = KnownErrorsFor<ReqT, Method>,
> = [Declared] extends [never]
  ? NuxtError<unknown>
  : NuxtError<KnownErrorBody<Extract<Declared, KnownVariant>>>

/** Vanilla `useFetch`'s signature with the error computed from the route. */
export interface UseCheckedFetch {
  <
    ResT = void,
    ReqT extends NitroFetchRequest = NitroFetchRequest,
    const Method extends RouteMethod<ReqT> = ResT extends void
      ? 'get' extends RouteMethod<ReqT>
        ? 'get'
        : RouteMethod<ReqT>
      : RouteMethod<ReqT>,
    _ResT = ResT extends void ? FetchResult<ReqT, Method> : ResT,
    DataT = _ResT,
    PickKeys extends KeysOf<DataT> = KeysOf<DataT>,
    DefaultT = undefined,
  >(
    request: Ref<ReqT> | ReqT | (() => ReqT),
    opts: UseFetchOptionsWithTransform<
      _ResT,
      DataT,
      PickKeys,
      DefaultT,
      ReqT,
      Method
    >
  ): AsyncData<
    PickFrom<DataT, PickKeys> | DefaultT,
    KnownErrorRef<ReqT, Method> | undefined
  >

  <
    ResT = void,
    ReqT extends NitroFetchRequest = NitroFetchRequest,
    const Method extends RouteMethod<ReqT> = ResT extends void
      ? 'get' extends RouteMethod<ReqT>
        ? 'get'
        : RouteMethod<ReqT>
      : RouteMethod<ReqT>,
    _ResT = ResT extends void ? FetchResult<ReqT, Method> : ResT,
    DataT = _ResT,
    PickKeys extends KeysOf<DataT> = KeysOf<DataT>,
    DefaultT = DataT,
  >(
    request: Ref<ReqT> | ReqT | (() => ReqT),
    opts: UseFetchOptionsWithTransform<
      _ResT,
      DataT,
      PickKeys,
      DefaultT,
      ReqT,
      Method
    >
  ): AsyncData<
    PickFrom<DataT, PickKeys> | DefaultT,
    KnownErrorRef<ReqT, Method> | undefined
  >

  <
    ResT = void,
    ReqT extends NitroFetchRequest = NitroFetchRequest,
    const Method extends RouteMethod<ReqT> = ResT extends void
      ? 'get' extends RouteMethod<ReqT>
        ? 'get'
        : RouteMethod<ReqT>
      : RouteMethod<ReqT>,
    _ResT = ResT extends void ? FetchResult<ReqT, Method> : ResT,
    DataT = _ResT,
    PickKeys extends KeysOf<DataT> = KeysOf<DataT>,
    DefaultT = undefined,
  >(
    request: Ref<ReqT> | ReqT | (() => ReqT),
    opts?: UseFetchOptions<_ResT, DataT, PickKeys, DefaultT, ReqT, Method>
  ): AsyncData<
    PickFrom<DataT, PickKeys> | DefaultT,
    KnownErrorRef<ReqT, Method> | undefined
  >

  <
    ResT = void,
    ReqT extends NitroFetchRequest = NitroFetchRequest,
    const Method extends RouteMethod<ReqT> = ResT extends void
      ? 'get' extends RouteMethod<ReqT>
        ? 'get'
        : RouteMethod<ReqT>
      : RouteMethod<ReqT>,
    _ResT = ResT extends void ? FetchResult<ReqT, Method> : ResT,
    DataT = _ResT,
    PickKeys extends KeysOf<DataT> = KeysOf<DataT>,
    DefaultT = DataT,
  >(
    request: Ref<ReqT> | ReqT | (() => ReqT),
    opts?: UseFetchOptions<_ResT, DataT, PickKeys, DefaultT, ReqT, Method>
  ): AsyncData<
    PickFrom<DataT, PickKeys> | DefaultT,
    KnownErrorRef<ReqT, Method> | undefined
  >

  <
    ResT = void,
    ReqT extends NitroFetchRequest = NitroFetchRequest,
    const Method extends RouteMethod<ReqT> = ResT extends void
      ? 'get' extends RouteMethod<ReqT>
        ? 'get'
        : RouteMethod<ReqT>
      : RouteMethod<ReqT>,
    _ResT = ResT extends void ? FetchResult<ReqT, Method> : ResT,
    DataT = _ResT,
    PickKeys extends KeysOf<DataT> = KeysOf<DataT>,
    DefaultT = undefined,
  >(
    request: Ref<ReqT> | ReqT | (() => ReqT),
    arg1?:
      | string
      | UseFetchOptions<_ResT, DataT, PickKeys, DefaultT, ReqT, Method>,
    arg2?: string
  ): AsyncData<
    PickFrom<DataT, PickKeys> | DefaultT,
    KnownErrorRef<ReqT, Method> | undefined
  >
}

// Without `accept`, Nitro's `isJsonRequest` falls back to a path test that
// fails outside `/api/**`, and a declared failure arrives as HTML.
const ACCEPT_JSON = 'application/json'

// Unwraps refs at every level - vanilla's option type is
// `ComputedOptions<HeadersInit>`, and reading the raw object without
// unwrapping stringifies a ref to `[object Object]`.
function resolveHeadersInit(raw: unknown): HeadersInit | undefined {
  if (raw === null || raw === undefined) return undefined

  if (raw instanceof Headers) return raw

  if (Array.isArray(raw)) {
    return raw.map((entry) => {
      const [name, value] = entry as [unknown, unknown]
      return [String(toValue(name)), String(toValue(value))] as [string, string]
    })
  }

  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).map(([name, value]) => [
      name,
      String(toValue(value)),
    ])
  )
}

// Handed back flattened: on same-origin SSR requests `useFetch` goes through
// h3's `fetchWithEvent`, which merges headers by object spread - a `Headers`
// instance spreads to nothing. A `computed` so vanilla's deep watch on the
// `headers` option keeps tracking the caller's refs.
function checkedHeaders(
  headers: unknown,
  token: string | undefined
): ComputedRef<HeadersInit> {
  return computed(() => {
    const merged = new Headers(resolveHeadersInit(toValue(headers)))

    if (!merged.has('accept')) merged.set('accept', ACCEPT_JSON)

    if (token !== undefined) merged.set(CHANNEL_HEADER, token)

    return Object.fromEntries(merged)
  })
}

// TODO
// Vanilla's runtime signature: the middle argument is either the options
// object or the auto-key.
type VanillaUseFetch = (
  request: unknown,
  arg1?: unknown,
  arg2?: unknown
) => unknown

function wrapVanillaFetch(vanilla: VanillaUseFetch): UseCheckedFetch {
  return ((request: unknown, arg1?: unknown, arg2?: unknown) => {
    const [opts, autoKey] =
      typeof arg1 === 'string'
        ? ([undefined, arg1] as const)
        : ([
            arg1 as Record<string, unknown> | undefined,
            arg2 as string | undefined,
          ] as const)

    return vanilla(
      request,
      {
        ...opts,
        headers: checkedHeaders(opts?.headers, configuredChannelToken),
      },
      autoKey
    )
  }) as UseCheckedFetch
}

/**
 * Vanilla's fetch composable with the route's declared union on the error ref:
 * `data` is what it always was, `error` still holds the framework's error
 * object, and `matchError(error, …)` is the one read path.
 */
export const useCheckedFetch: UseCheckedFetch = wrapVanillaFetch(
  useFetch as unknown as VanillaUseFetch
)

/**
 * The lazy sibling. Delegates to Nuxt's own `useLazyFetch` rather than passing
 * `lazy: true`, so Nuxt's dev-mode data diagnostics tag the call correctly.
 */
export const useLazyCheckedFetch: UseCheckedFetch = wrapVanillaFetch(
  useLazyFetch as unknown as VanillaUseFetch
)
