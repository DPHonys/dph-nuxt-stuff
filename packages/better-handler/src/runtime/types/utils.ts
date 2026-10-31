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

// The maps' extractors never answer `any` for a handler they can read, so an
// `any` entry is a handler module the compiler could not resolve - a
// JavaScript route a module ships without declarations, Nuxt's own renderer.
// Nothing is known of what it declares, so it declares nothing here, and the
// route stays as vanilla as Nitro's own types leave it. Boxed in tuples
// rather than `IsAny`: an unresolved import is the compiler's error type,
// which a conditional type over it answers with itself; boxed, it behaves as
// `any` does and is assignable to two different literals at once.
type Readable<Entry> = [Entry] extends [never]
  ? never
  : [Entry] extends [0]
    ? [Entry] extends [1]
      ? never
      : Entry
    : Entry

// One key's entry for one lowercase method: the method's own, else
// `default`'s, else nothing.
type MethodEntry<Methods, Method extends string> = Method extends keyof Methods
  ? Methods[Method]
  : 'default' extends keyof Methods
    ? Methods['default']
    : never

/**
 * A generated map's entry for one request path and method, or `never` when
 * the map has none. The method is looked up lowercased, then `default` -
 * by key presence, not on `never` as Nitro falls back: `never` is a real
 * value in these maps ("declares nothing"), and Nitro's rule would hand a
 * `post` caller the `default` handler's entry. A union method is looked up
 * one method at a time, each with its own fallback.
 *
 * A path matching several keys answers the union of their entries, as
 * Nitro's own typed `$fetch` does; `/` matches every key, so it answers every
 * route's entry for the method. An unreadable entry - `any` - is left out
 * per key, before the union, so one handler the compiler cannot read does
 * not erase the entries of the routes it overlaps.
 */
export type RouteEntry<Map, Route extends string, Method extends string> =
  RouteKeyOf<Route> extends infer Key
    ? Key extends keyof Map
      ? Lowercase<Method> extends infer Lower extends string
        ? Lower extends unknown
          ? Readable<MethodEntry<Map[Key], Lower>>
          : never
        : never
      : never
    : never
