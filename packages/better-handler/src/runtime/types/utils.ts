/** Type-level helpers shared by both halves; none of them is public. */

import type { RouteKeyOf } from './engine'

/** Whether `T` is `any`: only `any` absorbs the impossible `1 & T`. */
export type IsAny<T> = 0 extends 1 & T ? true : false

/** Whether `T` is a union of two or more members. */
export type IsUnion<T, U = T> = T extends unknown
  ? [U] extends [T]
    ? false
    : true
  : never

/**
 * The arguments after a helper's leading one: `[value]` when its slot carries
 * a value, `[]` when the slot is declared `null`. One signature with a rest
 * tuple rather than an overload per arity, so a rejected call reports the one
 * pairing it broke instead of an essay over every overload.
 */
export type ArgsFor<T> = [T] extends [null] ? [] : [value: T]

/**
 * A generated map's entry for one request path and method, or `never` when
 * the map has none. The method is looked up lowercased, then `default` -
 * by key presence, not on `never` as Nitro falls back: `never` is a real
 * value in these maps ("declares nothing"), and Nitro's rule would hand a
 * `post` caller the `default` handler's entry. A path matching several keys
 * answers the union of their entries.
 */
export type RouteEntry<Map, Route extends string, Method extends string> =
  RouteKeyOf<Route> extends infer Key
    ? Key extends keyof Map
      ? Lowercase<Method> extends keyof Map[Key]
        ? Map[Key][Lowercase<Method>]
        : 'default' extends keyof Map[Key]
          ? Map[Key]['default']
          : never
      : never
    : never

/**
 * How specific a route key is, in the order Nitro's router tries them: an
 * exact static key first, then one with params, then a catch-all.
 */
type Specificity<Key> = Key extends `${string}**${string}`
  ? 2
  : Key extends `${string}:${string}` | `${string}*${string}`
    ? 1
    : 0

// Nitro's `MatchedRoutes<'/'>` answers every key; `/` is served only by
// itself or by a root catch-all.
type Serves<Route, Key> = Route extends '/'
  ? Key extends '/' | `/**${string}`
    ? true
    : false
  : true

// One matched key's entry, ranked and boxed so a `never` entry ("declares
// nothing") stays a key that serves the request. A key whose entry is `any`
// is a handler the compiler could not read, boxed rather than tested with
// `IsAny` for the reason `Known` in `./index` gives, and is skipped.
type Ranked<Key, Entry> = [Entry] extends [never]
  ? { rank: Specificity<Key>; entry: [Entry] }
  : [Entry] extends [0]
    ? [Entry] extends [1]
      ? never
      : { rank: Specificity<Key>; entry: [Entry] }
    : { rank: Specificity<Key>; entry: [Entry] }

// Distributes over the matched keys; a key without the method, and without
// `default`, serves nothing, and h3 falls through to a less specific one.
type Candidate<Map, Key, Method extends string> = Key extends keyof Map
  ? Lowercase<Method> extends keyof Map[Key]
    ? Ranked<Key, Map[Key][Lowercase<Method>]>
    : 'default' extends keyof Map[Key]
      ? Ranked<Key, Map[Key]['default']>
      : never
  : never

type MostSpecific<Candidates> = [Extract<Candidates, { rank: 0 }>] extends [
  never,
]
  ? [Extract<Candidates, { rank: 1 }>] extends [never]
    ? Extract<Candidates, { rank: 2 }>
    : Extract<Candidates, { rank: 1 }>
  : Extract<Candidates, { rank: 0 }>

/**
 * A generated map's entry for one request path and method from the one key
 * that serves the request, or `never` when none does. A Request input is
 * what the serving handler accepts, so unlike `RouteEntry` this does not
 * union every matched key: that would let a catch-all's body through to the
 * param route beside it. Nitro's order, approximated: of the matched keys
 * with an entry for the method (or `default`), an exact static key beats a
 * key with params, which beats a catch-all, and keys that tie answer the
 * union of their entries. A key whose entry is `any` is skipped first.
 */
// The route lookup runs once, inferred into `Key` as `RouteEntry` does: a
// generic `MatchedRoutes` compared against anything reports a stack-depth
// error at every route key.
export type ServingEntry<Map, Route extends string, Method extends string> =
  RouteKeyOf<Route> extends infer Key
    ? MostSpecific<
        Key extends unknown
          ? Serves<Route, Key> extends true
            ? Candidate<Map, Key, Method>
            : never
          : never
      >['entry'][0]
    : never
