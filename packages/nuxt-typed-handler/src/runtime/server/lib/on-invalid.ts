import { KNOWN_ERROR_KEY } from '@dphonys/nuxt-handler-errors/shared'
import type { OnInvalid } from '@dphonys/nuxt-handler-validation/internals/server'
import { markValidationError } from '@dphonys/nuxt-handler-validation/internals/shared'
import type {
  ValidationErrorData,
  ValidationIssue,
} from '@dphonys/nuxt-handler-validation/types'
import { createError } from 'h3'
import type { H3Error } from 'h3'
import type { ValidationFailed } from '../../types/handler'
import { RESERVED_TAG } from './reserved-tag'

/**
 * The built-in variant's `data`: the errors parent's marker, and the issues
 * beside it at the path the validation parent documents - what a client reads
 * once the marker is stripped.
 */
export interface ValidationFailedData extends ValidationErrorData {
  [KNOWN_ERROR_KEY]: ValidationFailed
}

/**
 * The one built-in known error, `validation-failed` `400`, carrying both
 * parents' markers so both recognizers answer.
 *
 * Raised the way the errors parent raises a known error: `message` is the
 * tag, `statusMessage` is never set (the reason phrase survives an escaped
 * server-to-server throw untouched, so the tag must not ride it), and
 * `fatal`/`unhandled` are left alone so the production serializer keeps
 * `data`. Built here rather than through the parent's factory because that
 * factory owns `data` whole, and this variant carries a second key beside
 * the marker.
 */
export function validationFailedError(
  issues: readonly ValidationIssue[]
): H3Error<ValidationFailedData> {
  // Three copies, so neither place shares an array with the other or the
  // hook's input; the parent's marker copies its own snapshot again.
  const variant: ValidationFailed = {
    tag: RESERVED_TAG,
    status: 400,
    issues: [...issues],
  }
  const data: ValidationFailedData = {
    issues: [...issues],
    [KNOWN_ERROR_KEY]: variant,
  }

  const error = createError({ statusCode: 400, message: RESERVED_TAG, data })

  markValidationError(error, issues)

  return error
}

/** Every client-input rejection becomes the built-in variant. */
export const onInvalid: OnInvalid = (_source, issues) => {
  throw validationFailedError(issues)
}
