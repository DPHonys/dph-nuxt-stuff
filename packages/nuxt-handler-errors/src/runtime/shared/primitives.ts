import { z } from 'zod'

const stringSchema = z.string()

/** A string, told apart from the object alternative of a vanilla overload. */
export function isString(value: unknown): value is string {
  return stringSchema.safeParse(value).success
}

/**
 * Anything callable. `z.function()` builds a typed wrapper rather than a
 * plain guard in zod 4, so the guard is an `instanceof` check instead.
 */
export const functionSchema = z.instanceof(Function)
