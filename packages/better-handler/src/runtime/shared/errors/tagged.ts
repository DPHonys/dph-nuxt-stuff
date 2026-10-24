import type { TaggedError } from '../../types/errors/tagged'
import { isPlainObject, isString } from '../guards'

/**
 * Whether `value` is a Tagged error as it travels: a plain object whose
 * `_tag` is a string. Parsed, not trusted - a `data` that is present but
 * malformed reads as no Tagged error at all.
 */
function isTaggedError<Value>(value: Value): value is Value & TaggedError {
  return isPlainObject(value) && '_tag' in value && isString(value._tag)
}

/**
 * The Tagged error `value` is, handed back itself rather than copied, or
 * `undefined`. The caller picks the depth: an error's `data` where it was
 * raised, `data.data` on a fetched error, whose `data` is the whole body.
 */
export function taggedOf<Value>(value: Value): TaggedError | undefined {
  return isTaggedError(value) ? value : undefined
}
