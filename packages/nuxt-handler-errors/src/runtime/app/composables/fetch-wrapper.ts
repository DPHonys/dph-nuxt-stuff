import type { RouterMethod } from 'h3'
import type { AvailableRouterMethod, NitroFetchRequest } from 'nitropack/types'
import type { ComputedRef, Ref } from 'vue'
import { computed, toValue } from 'vue'
import type {
  AsyncData,
  FetchResult,
  NuxtError,
  useFetch,
  UseFetchOptions,
} from '#app'
import type { KeysOf, PickFrom } from '#app/composables/asyncData'
import type { UseFetchOptionsWithTransform } from '#app/composables/fetch'
import { CHANNEL_HEADER } from '../../shared/channel'
import { isString } from '../../shared/primitives'
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

/** Vanilla's runtime signature - its last overload, the one the compiler's key injection targets. */
export type VanillaFetchArgs = Parameters<typeof useFetch>

/** What vanilla hands back; the module layer that binds it owns the typed face. */
export type VanillaFetchResult = ReturnType<typeof useFetch>

/** The `headers` option as vanilla types it: refs and getters at every level. */
type HeadersOption = NonNullable<
  Exclude<VanillaFetchArgs[1], string>
>['headers']

// Takes the option with its outer ref or getter already read, and unwraps
// refs at every level below - vanilla's option type is
// `ComputedOptions<HeadersInit>`, and reading the raw object without
// unwrapping stringifies a ref to `[object Object]`.
function resolveHeadersInit(
  raw: ReturnType<typeof toValue<HeadersOption>>
): HeadersInit | undefined {
  if (raw === undefined) return undefined

  if (raw instanceof Headers) return raw

  if (Array.isArray(raw)) {
    return raw.map((entry) => {
      const [name, value] = toValue(entry)

      return [String(toValue(name)), String(toValue(value))]
    })
  }

  return Object.fromEntries(
    Object.entries(raw).map(([name, value]) => [name, String(toValue(value))])
  )
}

// Handed back flattened: on same-origin SSR requests `useFetch` goes through
// h3's `fetchWithEvent`, which merges headers by object spread - a `Headers`
// instance spreads to nothing. A `computed` so vanilla's deep watch on the
// `headers` option keeps tracking the caller's refs.
function checkedHeaders(
  headers: HeadersOption,
  token: string | undefined
): ComputedRef<HeadersInit> {
  return computed(() => {
    const merged = new Headers(resolveHeadersInit(toValue(headers)))

    if (!merged.has('accept')) merged.set('accept', ACCEPT_JSON)

    if (token !== undefined) merged.set(CHANNEL_HEADER, token)

    return Object.fromEntries(merged)
  })
}

export type RawUseFetch = (...args: VanillaFetchArgs) => VanillaFetchResult

export interface FetchWrapperOptions {
  /** Read once per composable call, never at bind time - a binding may hand in a getter. */
  readonly token: string | undefined
}

// The returned shape is vanilla's own runtime signature: the module layer
// that binds it owns the route-typed face, and applies it with one cast.
export function wrapVanillaFetch(
  vanilla: typeof useFetch,
  options: FetchWrapperOptions
): RawUseFetch {
  // Vanilla's last overload is its runtime signature: the middle argument is
  // either the options object or the auto-key.
  return (request, arg1, arg2) => {
    const [opts, autoKey] = isString(arg1) ? [undefined, arg1] : [arg1, arg2]

    return vanilla(
      request,
      {
        ...opts,
        headers: checkedHeaders(opts?.headers, options.token),
      },
      autoKey
    )
  }
}
