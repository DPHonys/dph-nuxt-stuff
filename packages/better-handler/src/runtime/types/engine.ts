/**
 * The response-typing seam: the only file in the package that imports
 * `nitropack/types`, and the one home of h3's router method type. On Nuxt 5
 * the route and wire types come from Nuxt's generated route engine instead,
 * and only the aliases below change.
 *
 * `Wire` is public through `/types` because the generated type map applies it
 * to every route, so the generated file names no Nitro specifier at all.
 */

import type { RouterMethod } from 'h3'
import type { MatchedRoutes, Serialize, Simplify } from 'nitropack/types'

/** A method a route can be fetched with, lowercase as Nitro keys them. */
export type RouteMethod = RouterMethod

/**
 * The keys of the generated maps a request path matches: Nitro's own route
 * matching, so `/api/orders/7` finds the `/api/orders/:id` entry.
 */
export type RouteKeyOf<Route extends string> = MatchedRoutes<Route>

/**
 * A value as a client receives it once it has crossed the wire as JSON: a
 * `Date` arrives as a string, a function-valued key not at all.
 */
export type Wire<T> = Simplify<Serialize<T>>
