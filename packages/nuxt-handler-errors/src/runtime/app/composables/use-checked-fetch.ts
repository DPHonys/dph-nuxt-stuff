/**
 * `useCheckedFetch` / `useLazyCheckedFetch`: vanilla's fetch composable with
 * the error slot computed instead of defaulted, and nothing else. Not on a
 * published specifier, and that is forced — this file imports `#app`, which
 * exists in the app build only — so the auto-import registration in
 * `src/module.ts` is the whole contract for these two names; an explicit import
 * is `#imports`.
 */

import type { RouterMethod } from 'h3'
import type { AvailableRouterMethod, NitroFetchRequest } from 'nitropack/types'
import type { ComputedRef, Ref } from 'vue'
import { computed, toValue } from 'vue'
import type { AsyncData, FetchResult, NuxtError, UseFetchOptions } from '#app'
import { useFetch, useLazyFetch, useRuntimeConfig } from '#app'
import type { KeysOf, PickFrom } from '#app/composables/asyncData'
import type { UseFetchOptionsWithTransform } from '#app/composables/fetch'
import { CHANNEL_HEADER, readChannelToken } from '../../shared/channel'
import type { KnownErrorBody } from '../../shared/wire'
import type { KnownErrorsOfRoute, KnownVariant } from '../../types'

// ---------------------------------------------------------------------------
// The error type
// ---------------------------------------------------------------------------

/**
 * Exactly vanilla's own method set for a request: the route's available methods
 * in either case.
 */
type RouteMethod<R extends NitroFetchRequest> =
  | AvailableRouterMethod<R>
  | Uppercase<AvailableRouterMethod<R>>

/**
 * The declared union for a call, from the request and method alone. `ReqT
 * extends string` because `NitroFetchRequest` also admits a `Request` object no
 * route path can be read out of; the `Method extends …` arm is where the
 * compiler will accept `Method` in {@link KnownErrorsOfRoute}'s constraint
 * position (a raw `Exclude<O['method'], undefined>` is not).
 */
type KnownErrorsFor<ReqT, Method> = ReqT extends string
  ? Method extends RouterMethod | Uppercase<RouterMethod>
    ? KnownErrorsOfRoute<ReqT, Method>
    : never
  : never

/**
 * What the composable's `error` ref holds: the envelope, because Nuxt's
 * `useAsyncData` unconditionally reassigns `error.value = createError(error)` —
 * a bare tagged union here would type-check while lying.
 *
 * The undeclared collapse is mandatory (`NuxtError<never>` is *narrower* than
 * vanilla's `NuxtError<unknown>`, and `never` does not propagate outward
 * through a wrapper type). `Declared` is a defaulted parameter so
 * {@link KnownErrorsFor} is instantiated once per call. A twin of this alias
 * lives in `types/fetch.ts` for the imperative surface, deliberately unshared —
 * the method slots are spelled differently and neither is public API.
 */
export type KnownErrorRef<
  ReqT,
  Method,
  Declared = KnownErrorsFor<ReqT, Method>,
> = [Declared] extends [never]
  ? NuxtError<unknown>
  : NuxtError<KnownErrorBody<Extract<Declared, KnownVariant>>>

// ---------------------------------------------------------------------------
// The declaration
// ---------------------------------------------------------------------------

/**
 * A full five-overload mirror of vanilla `useFetch` with the `ErrorT` slot
 * **deleted** from each and the error computed in the return type instead.
 *
 * All five, because a missing overload is a compile error the degradation lock
 * forbids (a single signature broke `useCheckedFetch<Foo>(url)` and
 * `useCheckedFetch(url, 'my-key')`); overloads 2 and 4 were never observed to
 * win resolution, but what selects them was never established, so they are
 * mirrored rather than dropped. The `ErrorT` slot is deleted rather than moved:
 * `TS2744` stops it defaulting from anything computed from the later-declared
 * `ReqT`, hoisting `ReqT` costs the explicit-response-type call shape, and
 * passing the slot explicitly collapsed `data.value` to `unknown` anyway. An
 * interface, so the overload count never reaches the hover.
 */
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

// ---------------------------------------------------------------------------
// The header merge — the COMPOSABLE form
// ---------------------------------------------------------------------------

/**
 * Required on every request: without it Nitro's `isJsonRequest` falls back to a
 * path test that fails outside `/api/**` and under a non-root `app.baseURL`,
 * and a declared failure arrives as a rendered HTML page.
 */
const ACCEPT_JSON = 'application/json'

/**
 * Resolve a caller's `headers` option, unwrapping refs at every level —
 * vanilla's option type is `ComputedOptions<HeadersInit>`, and anything that
 * reads the raw object before `reactive()` proxies it must unwrap itself, or a
 * `ref('Bearer …')` stringifies to `[object Object]`.
 */
function resolveHeadersInit(raw: unknown): HeadersInit | undefined {
  if (raw === null || raw === undefined) return undefined

  // A `Headers` instance is already exactly what the constructor wants, and
  // rebuilding it entry by entry would only risk losing one.
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

/**
 * The call's headers with `accept` added when the caller did not name one, plus
 * the channel tag when one is configured — built through a `Headers` (the one
 * merge that accepts all three legal input forms) and handed back **flattened**: on same-origin SSR requests `useFetch`
 * swaps in `useRequestFetch()`, which is `event.$fetch` over h3's
 * `fetchWithEvent`, and that merges headers by object spread — where a
 * `Headers` instance spreads to nothing and loses everything. Measured.
 *
 * A `computed` because `headers` is a watched option: vanilla's deep watch
 * tracks whatever the computation read, so `headers: someRef` still re-fetches
 * on change; eager resolution would freeze it, a plain getter would be tracked
 * by nothing. No instance-defaults check exists on this surface — nothing here
 * can read an `opts.$fetch` instance's defaults, so the call is the whole of
 * "already carries it".
 */
function checkedHeaders(
  headers: unknown,
  token: string | undefined
): ComputedRef<HeadersInit> {
  return computed(() => {
    const merged = new Headers(resolveHeadersInit(toValue(headers)))

    if (!merged.has('accept')) merged.set('accept', ACCEPT_JSON)

    // The channel tag, when the consumer configured one. `set`, as in the other
    // two merge forms — the header is the module's own.
    if (token !== undefined) merged.set(CHANNEL_HEADER, token)

    return Object.fromEntries(merged)
  })
}

// ---------------------------------------------------------------------------
// The values
// ---------------------------------------------------------------------------

/**
 * Vanilla's runtime signature, which is overload 5's: the middle argument is
 * either the options object or the auto-key, and the third is the auto-key when
 * the middle one was not.
 */
type VanillaUseFetch = (
  request: unknown,
  arg1?: unknown,
  arg2?: unknown
) => unknown

/**
 * Split vanilla's `(request, arg1, arg2)` the way vanilla splits it, add the
 * header, and spread everything else straight on — which is what makes "every
 * vanilla option carries over verbatim" true by construction. The auto-key is
 * forwarded in vanilla's own third position, so `useCheckedFetch(url, 'my-key')`
 * keeps meaning what it meant.
 */
function wrapVanillaFetch(vanilla: VanillaUseFetch): UseCheckedFetch {
  return ((request: unknown, arg1?: unknown, arg2?: unknown) => {
    const [opts, autoKey] =
      typeof arg1 === 'string'
        ? ([undefined, arg1] as const)
        : ([
            arg1 as Record<string, unknown> | undefined,
            arg2 as string | undefined,
          ] as const)

    // Read here rather than inside the computed: `useRuntimeConfig()` wants the
    // Nuxt instance, which is guaranteed at the call site (a composable) and
    // not inside a computation vanilla may re-run later. It is the app's own
    // route to the token on **both** sides — the browser's client plugin and
    // Nitro's plugin each fill a box in their own bundle, and this file runs in
    // neither during SSR.
    const token = readChannelToken(useRuntimeConfig())

    return vanilla(
      request,
      { ...opts, headers: checkedHeaders(opts?.headers, token) },
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
 * `lazy: true` — Nuxt also tags the call for its dev-mode data diagnostics, and
 * that tag would be wrong if the option came from here.
 */
export const useLazyCheckedFetch: UseCheckedFetch = wrapVanillaFetch(
  useLazyFetch as unknown as VanillaUseFetch
)
