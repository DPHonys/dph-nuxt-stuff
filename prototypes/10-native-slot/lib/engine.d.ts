// PROTOTYPE (ticket 10). The response-typing seam: the only file in lib/ that
// imports `nitropack/types` or h3's `RouterMethod`. Everything the fetch
// family needs from Nitro's `InternalApi` engine is re-exported from here, so
// a Nuxt 5 adapter replaces this file and nothing else.
import type { RouterMethod } from 'h3'
import type {
  $Fetch,
  AvailableRouterMethod,
  MatchedRoutes,
  NitroFetchOptions,
  NitroFetchRequest,
  Serialize,
  Simplify,
  TypedInternalResponse,
} from 'nitropack/types'

export type FetchRequest = NitroFetchRequest
export type RouteMethod = RouterMethod
export type RouteMethodOf<R extends FetchRequest> = AvailableRouterMethod<R>
export type RouteKeyOf<R extends string> = MatchedRoutes<R>
export type ResponseOf<R, T, M extends RouteMethod> = TypedInternalResponse<
  R,
  T,
  M
>
export type VanillaFetchOptions<
  R extends FetchRequest,
  M extends RouteMethodOf<R> = RouteMethodOf<R>,
> = NitroFetchOptions<R, M>
export type FetchDefaults = Parameters<$Fetch['create']>[0]
// ofetch's `FetchResponse<T>` is `Response & { _data?: T }`. Spelled out
// rather than indexed out of `ReturnType<$Fetch['raw']>`: that instantiates
// Nitro's generic `raw` at its constraints, and a failing `.raw` call's error
// elaboration then reports TS2321 at the call site.
export type RawFetchResponse<T> = Response & { _data?: T }
/** What the KnownApiErrors slot applies to a handler's tagged errors. */
export type Wire<T> = Simplify<Serialize<T>>
/** What the KnownApiRequestInputs slot applies to a handler's Request input. */
export type WireInput<T> = Simplify<T>
