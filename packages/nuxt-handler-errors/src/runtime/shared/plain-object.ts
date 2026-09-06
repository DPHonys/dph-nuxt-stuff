import * as v from 'valibot'

const recordSchema = v.record(v.string(), v.unknown())

/** A non-null, non-array object, with nothing claimed about its values. */
export type PlainObject = v.InferOutput<typeof recordSchema>

/**
 * valibot's object schemas accept an array and copy their input before any
 * piped check runs, so the array test has to sit in front of the parse.
 */
export function isPlainObject(value: unknown): value is PlainObject {
  return !Array.isArray(value) && v.is(recordSchema, value)
}
