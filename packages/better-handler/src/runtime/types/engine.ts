/**
 * The response-typing seam: the only file in the package that imports
 * `nitropack/types`, and the one home of h3's router method type. Every route
 * lookup, every response type and every vanilla option the fetch family reads
 * comes through the aliases below, Nuxt's own `useFetch` options included. On
 * Nuxt 5 they come from Nuxt's generated route engine instead, and only the
 * aliases change.
 *
 * `Wire` is public through `/types` because the generated type map applies it
 * to every route, so the generated file names no Nitro specifier at all.
 */

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
import type { UseFetchOptions } from 'nuxt/app'

/** A method a route can be fetched with, lowercase as Nitro keys them. */
export type RouteMethod = RouterMethod

/**
 * What a fetch may be called with: a route path Nitro serves, any other
 * string, or a `Request` object, which no route path can be read out of.
 */
export type FetchRequest = NitroFetchRequest

/**
 * The methods a request path can be fetched with, lowercase: the route's own
 * when it names them, every method for a handler that names none and for a
 * path no route matches.
 */
export type RouteMethodOf<Request extends FetchRequest> =
  AvailableRouterMethod<Request>

/**
 * The keys of the generated maps a request path matches: Nitro's own route
 * matching, so `/api/orders/7` finds the `/api/orders/:id` entry.
 */
export type RouteKeyOf<Route extends string> = MatchedRoutes<Route>

/**
 * What one call to a request path resolves to on success: the route's
 * response as it crosses the wire, or the caller's own `T` when one is given.
 * A route that only throws answers `unknown` here, where Nuxt's generated
 * engine keeps `never`.
 */
export type ResponseOf<
  Request,
  T,
  Method extends RouteMethod,
> = TypedInternalResponse<Request, T, Method>

/** The options vanilla `$fetch` takes for a request path and method. */
export type VanillaFetchOptions<
  Request extends FetchRequest,
  Method extends RouteMethodOf<Request> = RouteMethodOf<Request>,
> = NitroFetchOptions<Request, Method>

/**
 * What `$fetch.create` takes: ofetch's own options, read off Nitro's
 * declaration rather than imported from a package this one does not depend on.
 */
export type FetchDefaults = Parameters<$Fetch['create']>[0]

/**
 * What a `.raw` call resolves to: ofetch's `FetchResponse<T>`, spelled out.
 * Indexing it out of `ReturnType<$Fetch['raw']>` would instantiate Nitro's
 * generic `raw` at its constraints, and a failing `.raw` call then reports an
 * excessive stack depth at the call site.
 */
export type RawFetchResponse<T> = Response & { _data?: T }

/**
 * A value as a client receives it once it has crossed the wire as JSON: a
 * `Date` arrives as a string, a function-valued key not at all.
 */
export type Wire<T> = Simplify<Serialize<T>>

/**
 * Nuxt's own `useFetch` options for a request path and method, read for the
 * keys the fetch family leaves as they are: the async-data options and the
 * ofetch options beside the request.
 *
 * Nuxt's declaration changes shape between 4.0 and 4.6: the path is a
 * `NitroFetchRequest` at 4.0 and any string at 4.6, and the method parameter
 * takes Nitro's methods for the path at 4.0 and any method in either case at
 * 4.6. A string path and a lowercase method the path has satisfy both; the
 * caller omits every key that differs by version or by route engine
 * (`method`, `body`, `query`, `headers`, `params`) and restates it.
 */
export type VanillaUseFetchOptions<
  ResT,
  Request extends FetchRequest,
  Method extends string,
> = UseFetchOptions<
  ResT,
  ResT,
  never,
  undefined,
  Request & string,
  Extract<Lowercase<Method>, RouteMethodOf<Request & string>>
>
