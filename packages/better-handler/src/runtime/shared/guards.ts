/**
 * The runtime shape tests every half of the package shares, each a type
 * predicate. Plain `typeof` and prototype checks: nothing here pulls a schema
 * library into the bundle.
 */

import type { StandardSchemaV1 } from '@standard-schema/spec'

/** Whether `value` is a string. */
export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

/**
 * Whether `value` can be called. Typed with `never` parameters, so a caller
 * learns it is a function without being handed a signature to call it with.
 */
export function isFunction(
  value: unknown
): value is (...args: never[]) => void {
  return typeof value === 'function'
}

/**
 * Whether `value` is an object a caller reads keys off: not `null`, not an
 * array, not callable. Class instances pass, which is the point - a schema
 * library's output or an Effect error is a record to a reader of its keys.
 */
export function isRecordLike(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Whether `value` implements Standard Schema v1: an object or a callable
 * carrying a `~standard` object whose `version` is `1` and whose `validate`
 * is a function. Nothing else is consulted, so any conforming library passes.
 */
export function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  // A schema's host may be callable (arktype's are), so a function passes
  // this first test as well as an object does.
  if (!isRecordLike(value) && !isFunction(value)) return false
  if (!('~standard' in value)) return false

  const standard = value['~standard']

  return (
    isRecordLike(standard) &&
    'version' in standard &&
    standard.version === 1 &&
    'validate' in standard &&
    isFunction(standard.validate)
  )
}
