import type { EventHandlerRequest } from 'h3'
import type { RequestInput } from './input'

/**
 * What h3 v1 lets one query key carry: ufo's `QueryValue | QueryValue[]`,
 * read off h3's own request type so the package names no `ufo` of its own.
 */
type QueryCarriable = NonNullable<EventHandlerRequest['query']>[string]

/**
 * One query value as the slot carries it: itself when a query can carry it,
 * and any query value when it cannot. Distributed, so a union keeps every
 * member a query can carry. `z.coerce.*` inputs `unknown`, which no query
 * value is; widened, the route stays typed on the native path, its keys
 * checked and its other values exact.
 */
type CarriedQueryValue<Value> = Value extends QueryCarriable
  ? Value
  : QueryCarriable

/**
 * A declared query as the slot carries it. A record is restated key for key,
 * which also gives an interface-typed input the implicit index signature h3's
 * `QueryObject` needs, and each value goes through `CarriedQueryValue`. A
 * query that is no record (an array, a primitive, `unknown`) is `never`,
 * which Nuxt's extractor would answer for it anyway: carried as declared, h3
 * would refuse the whole slot, and Nuxt would lose the route's body with it.
 * Distributed, so a union of records and non-records keeps its records.
 */
type NativeQuery<Query> = Query extends readonly unknown[]
  ? never
  : Query extends object
    ? { [Key in keyof Query]: CarriedQueryValue<Query[Key]> }
    : never

/**
 * The `H3Event<Request>` slot of the Handler `defineBetterEventHandler`
 * returns: the route's Request input narrowed to `body` and `query`, the two
 * sources h3 v1's `EventHandlerRequest` describes, each key present only when
 * the route declares that source. Nuxt 4.6's extractor (`RequestBodyOf`,
 * `RequestQueryOf`) reads it, so vanilla `$fetch` and `useFetch` type a
 * route's body and query when an app turns `experimental.routeTypedFetch` on.
 *
 * The extractor infers the slot under h3's constraint, so the slot must always
 * satisfy it or Nuxt reads nothing of the route: the body passes through as
 * declared, h3 typing it `any`, and the query goes through `NativeQuery`.
 * The generated map reads the Request input itself, through its own slot,
 * and keeps every source exactly as declared.
 */
export type NativeRequest<Input> = {
  [Key in keyof RequestInput<Input> as Key extends 'body' | 'query'
    ? Key
    : never]: Key extends 'query'
    ? NativeQuery<RequestInput<Input>[Key]>
    : RequestInput<Input>[Key]
}
