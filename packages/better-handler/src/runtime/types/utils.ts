/** Type-level helpers shared by both halves; none of them is public. */

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
 *
 * `any`, an untyped schema's answer, is a value: it would pass for `null`
 * too, and drop the slot the runtime still demands.
 */
export type ArgsFor<T> =
  IsAny<T> extends true ? [value: T] : [T] extends [null] ? [] : [value: T]
