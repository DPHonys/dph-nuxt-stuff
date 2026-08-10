/** Whether `T` is `any` - `any` absorbs the impossible `0 extends 1`. */
export type IsAny<T> = 0 extends 1 & T ? true : false

/** Whether `T` is a union. */
export type IsUnion<T, U = T> = T extends any
  ? [U] extends [T]
    ? false
    : true
  : never
