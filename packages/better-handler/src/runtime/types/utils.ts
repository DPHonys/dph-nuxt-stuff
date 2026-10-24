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
