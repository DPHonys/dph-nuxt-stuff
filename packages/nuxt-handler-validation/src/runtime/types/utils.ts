/** Whether `T` is `any` - `any` absorbs the impossible `0 extends 1`. */
export type IsAny<T> = 0 extends 1 & T ? true : false
