import type { RequestInputOfRoute } from '@dphonys/better-handler/types'

/**
 * What a client must send each of this app's routes, read from the request
 * inputs `nuxt prepare` generated beside the Known errors in
 * `.nuxt/types/better-handler.d.ts`. Compiler-asserted, as
 * `known-errors.check.ts` is: `pnpm typecheck` runs `vue-tsc` over this
 * project, on the Nuxt 4.0 floor as on the latest 4.x.
 */

/** Restated rather than imported: an app has no business in a test tree. */
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false

type Assert<T extends true> = T

/** A body, as its schema's input: what a client sends, not what it parses to. */
export type BodyHolds = Assert<
  Equal<
    RequestInputOfRoute<'/api/users', 'post'>,
    { body: { name: string; age: number } }
  >
>

/** A query before its transform: `page` is the string the URL carries. */
export type QueryHolds = Assert<
  Equal<RequestInputOfRoute<'/api/search'>, { query: { page: string } }>
>

/** A tuple-composed query, its elements' inputs intersected. */
export type ComposedHolds = Assert<
  Equal<
    RequestInputOfRoute<'/api/reports'>,
    { query: { page: string; sort: 'asc' | 'desc'; report: string } }
  >
>

/** Every declared source, the method in either case. */
export type SourcesHold = Assert<
  Equal<
    RequestInputOfRoute<'/api/receipts', 'POST'>,
    { query: { dryRun?: 'yes' | 'no' }; body: { total: number } }
  >
>

/** The route source, looked up by a request path. */
export type RouteHolds = Assert<
  Equal<RequestInputOfRoute<'/api/invoices/7'>, { route: { id: string } }>
>

/** A route of this package declaring no source: nothing in particular. */
export type NothingDeclaredHolds = Assert<
  // eslint-disable-next-line ts/no-empty-object-type -- the route declares no source
  Equal<RequestInputOfRoute<'/api/orders/7'>, {}>
>

/** A route Nuxt serves from a module the compiler cannot read: untyped. */
export type VanillaHolds = Assert<
  Equal<RequestInputOfRoute<'/__nuxt_error'>, never>
>
