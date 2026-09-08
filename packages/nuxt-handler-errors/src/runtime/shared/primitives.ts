import { z } from 'zod'

const stringSchema = z.string()

/** A string, told apart from the object alternative of a vanilla overload. */
export function isString(value: unknown): value is string {
  return stringSchema.safeParse(value).success
}

/**
 * Anything callable. `z.function()` builds a typed wrapper rather than a
 * plain guard in zod 4, so the schema is an `instanceof` check instead.
 */
export const functionSchema = z.instanceof(Function)

/** Any callable: a `void` return accepts every signature without `Function`'s untyped call. */
export type AnyFunction = (...args: never[]) => void

export function isFunction(value: unknown): value is AnyFunction {
  return functionSchema.safeParse(value).success
}
