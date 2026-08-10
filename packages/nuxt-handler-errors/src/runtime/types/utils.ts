/**
 * Type-level utilities with no domain of their own, shared by the guards that
 * need them. Deliberately absent from `./index`: every name that barrel
 * publishes is public API for good, and these two are implementation details.
 */

/**
 * Whether `T` is `any`. The only reliable detector — `any` absorbs the
 * impossible `0 extends 1`. Load-bearing in `KnownErrorsOfHandler`, which
 * fails *silently* without it: an untyped handler would match the brand with
 * `E = unknown` and destroy narrowing at every call site.
 */
export type IsAny<T> = 0 extends 1 & T ? true : false

/**
 * Whether `T` is a union. Distributes, then asks whether the whole is
 * contained in the member — false only when the two are the same type.
 */
export type IsUnion<T, U = T> = T extends any
  ? [U] extends [T]
    ? false
    : true
  : never
