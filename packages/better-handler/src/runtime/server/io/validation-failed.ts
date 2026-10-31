import type { ReservedTag } from '../../types/errors/declaration'
import type { ValidationFailed } from '../../types/io/input'
import { createKnownError } from '../errors/known-error'
import type { OnInvalid } from './issues'

/** The Built-in validation-failed variant's tag, which no route may declare. */
const VALIDATION_FAILED = 'validation-failed' satisfies ReservedTag

/** The status every validation failure goes out with. */
const VALIDATION_FAILED_STATUS = 400

/**
 * The failure door every route declaring `input` uses: the rejected source's
 * projected issues raised as the Built-in validation-failed variant, through
 * the same construction as every other Known error, so the wire carries
 * `data: { _tag: 'validation-failed', issues }` and `recognizeKnownError`
 * reads it as it reads any declared variant.
 */
export const raiseValidationFailed: OnInvalid = (_source, issues) => {
  // Copied, so the error does not share an array with its caller.
  const tagged: ValidationFailed = {
    _tag: VALIDATION_FAILED,
    issues: [...issues],
  }

  throw createKnownError(VALIDATION_FAILED_STATUS, tagged)
}
