import { z } from 'zod'

// `z.record` would reject class instances (an `Error`, a schema object);
// an empty loose object accepts any non-null, non-array, non-callable object,
// with unknown values, which is what a plain object means here.
const recordSchema = z.looseObject({})

/** A non-null, non-array object, with nothing claimed about its values. */
export type PlainObject = z.infer<typeof recordSchema>

/**
 * zod's object schemas reject arrays and callables on their own, so the parse
 * alone decides.
 */
export function isPlainObject(value: unknown): value is PlainObject {
  return recordSchema.safeParse(value).success
}
