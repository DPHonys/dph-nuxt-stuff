/**
 * `useTypedFetch` / `useLazyTypedFetch`: vanilla's fetch composable with
 * typings added and nothing else. Not on a published specifier, and that is
 * forced — this file imports `#app`, which exists in the app build only — so
 * the auto-import registration in `src/module.ts` is the whole contract for
 * these two names; an explicit import is `#imports`.
 */

import type { RouterMethod } from 'h3'
import type { AvailableRouterMethod, NitroFetchRequest } from 'nitropack/types'
import { computed, toValue } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { useFetch, useLazyFetch } from '#app'
import type { AsyncData, FetchResult, NuxtError, UseFetchOptions } from '#app'
import type { KeysOf, PickFrom } from '#app/composables/asyncData'
import type { UseFetchOptionsWithTransform } from '#app/composables/fetch'
import type {
  AnyVariant,
  DeclaredErrorBody,
  DeclaredErrorsOf,
  Flatten,
} from '../../types'

// ---------------------------------------------------------------------------
// The error type
// ---------------------------------------------------------------------------

/**
 * Exactly vanilla's own method set for a request: the route's available
 * methods in either case.
 */
type RouteMethod<R extends NitroFetchRequest> =
  | AvailableRouterMethod<R>
  | Uppercase<AvailableRouterMethod<R>>

/**
 * The declared union for a call, from the request and method alone. `ReqT
 * extends string` because `NitroFetchRequest` also admits a `Request` object
 * no route path can be read out of; the `Method extends …` arm is where the
 * compiler will accept `Method` in {@link DeclaredErrorsOf}'s constraint
 * position (a raw `Exclude<O['method'], undefined>` is not).
 */
type DeclaredErrorsFor<ReqT, Method> = ReqT extends string
  ? Method extends RouterMethod | Uppercase<RouterMethod>
    ? DeclaredErrorsOf<ReqT, Method>
    : never
  : never

/**
 * What the composable's `error` ref holds: the envelope, because Nuxt's
 * `useAsyncData` unconditionally reassigns `error.value = createError(error)`
 * — a bare tagged union here would type-check while lying.
 *
 * The undeclared collapse is mandatory (`NuxtError<never>` is *narrower* than
 * vanilla's `NuxtError<unknown>`, and `never` does not propagate outward
 * through a wrapper type). `Flatten` must be applied **inside this alias
 * body** — anywhere else the printer keeps the alias name and renders the
 * map's `SerializeObject` residue instead of flat variants (measured 212 vs
 * 371 chars). `Declared` is a defaulted parameter so {@link DeclaredErrorsFor}
 * is instantiated once per call.
 */
export type TypedErrorRef<
  ReqT,
  Method,
  Declared = DeclaredErrorsFor<ReqT, Method>,
> = [Declared] extends [never]
  ? NuxtError<unknown>
  : NuxtError<DeclaredErrorBody<Extract<Flatten<Declared>, AnyVariant>>>

// ---------------------------------------------------------------------------
// The declaration
// ---------------------------------------------------------------------------

/**
 * A full five-overload mirror of vanilla `useFetch` with the `ErrorT` slot
 * **deleted** from each and the error computed in the return type instead.
 *
 * All five, because a missing overload is a compile error the degradation
 * lock forbids (a single signature broke `useTypedFetch<Foo>(url)` and
 * `useTypedFetch(url, 'my-key')`); overloads 2 and 4 were never observed to
 * win resolution, but what selects them was never established, so they are
 * mirrored rather than dropped. The `ErrorT` slot is deleted rather than
 * moved: `TS2744` stops it defaulting from anything computed from the
 * later-declared `ReqT`, hoisting `ReqT` costs the explicit-response-type
 * call shape, and passing the slot explicitly collapsed `data.value` to
 * `unknown` anyway. An interface, so the overload count never reaches the
 * hover.
 */
export interface UseTypedFetch {
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
    TypedErrorRef<ReqT, Method> | undefined
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
    TypedErrorRef<ReqT, Method> | undefined
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
    TypedErrorRef<ReqT, Method> | undefined
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
    TypedErrorRef<ReqT, Method> | undefined
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
    TypedErrorRef<ReqT, Method> | undefined
  >
}

// ---------------------------------------------------------------------------
// The header merge
// ---------------------------------------------------------------------------

/**
 * Required on every request: without it Nitro's `isJsonRequest` falls back to
 * a path test that fails outside `/api/**` and under a non-root `app.baseURL`,
 * and a declared failure arrives as a rendered HTML page.
 */
const ACCEPT_JSON = 'application/json'

/**
 * Resolve a caller's `headers` option, unwrapping refs at every level —
 * vanilla's option type is `ComputedOptions<HeadersInit>`, and anything that
 * reads the raw object before `reactive()` proxies it must unwrap itself, or
 * a `ref('Bearer …')` stringifies to `[object Object]`.
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
 * The call's headers with `accept` added when the caller did not name one —
 * built through a `Headers` (the one merge that accepts all three legal input
 * forms) and handed back **flattened**: on same-origin SSR requests `useFetch`
 * swaps in `useRequestFetch()`, which is `event.$fetch` over h3's
 * `fetchWithEvent`, and that merges headers by object spread — where a
 * `Headers` instance spreads to nothing and loses everything. Measured.
 *
 * A `computed` because `headers` is a watched option: vanilla's deep watch
 * tracks whatever the computation read, so `headers: someRef` still
 * re-fetches on change; eager resolution would freeze it, a plain getter
 * would be tracked by nothing. No instance-defaults check exists on this
 * surface — nothing here can read an `opts.$fetch` instance's defaults, so
 * the call is the whole of "already carries it".
 */
function acceptJsonHeaders(headers: unknown): ComputedRef<HeadersInit> {
  return computed(() => {
    const merged = new Headers(resolveHeadersInit(toValue(headers)))

    if (!merged.has('accept')) merged.set('accept', ACCEPT_JSON)

    return Object.fromEntries(merged)
  })
}

// ---------------------------------------------------------------------------
// The values
// ---------------------------------------------------------------------------

/**
 * Vanilla's runtime signature, which is overload 5's: the middle argument is
 * either the options object or the auto-key, and the third is the auto-key
 * when the middle one was not.
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
 * forwarded in vanilla's own third position, so `useTypedFetch(url, 'my-key')`
 * keeps meaning what it meant.
 */
function wrapVanillaFetch(vanilla: VanillaUseFetch): UseTypedFetch {
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
      { ...opts, headers: acceptJsonHeaders(opts?.headers) },
      autoKey
    )
  }) as UseTypedFetch
}

/**
 * Vanilla's fetch composable, with typings added and nothing else: `data` is
 * what it always was, `error` still holds the framework's error object, and
 * the declared union is one `useDeclaredError(error)` call away.
 */
export const useTypedFetch: UseTypedFetch = wrapVanillaFetch(
  useFetch as unknown as VanillaUseFetch
)

/**
 * The lazy sibling. Delegates to Nuxt's own `useLazyFetch` rather than
 * passing `lazy: true` — Nuxt also tags the call for its dev-mode data
 * diagnostics, and that tag would be wrong if the option came from here.
 */
export const useLazyTypedFetch: UseTypedFetch = wrapVanillaFetch(
  useLazyFetch as unknown as VanillaUseFetch
)
