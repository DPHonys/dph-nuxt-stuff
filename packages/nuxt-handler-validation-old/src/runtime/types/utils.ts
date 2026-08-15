/** Whether `T` is `any` - `any` absorbs the impossible `0 extends 1`. */
export type IsAny<T> = 0 extends 1 & T ? true : false

/** Whether `T` is a union of two or more members. */
export type IsUnion<T, U = T> = T extends unknown
  ? [U] extends [T]
    ? false
    : true
  : never

/** Every key of every member of a union, rather than the shared ones. */
export type KeysOfUnion<T> = T extends unknown ? keyof T : never

/** A union's members intersected - `A | B` to `A & B`. */
export type UnionToIntersection<U> = (
  U extends unknown ? (x: U) => void : never
) extends (x: infer I) => void
  ? I
  : never
