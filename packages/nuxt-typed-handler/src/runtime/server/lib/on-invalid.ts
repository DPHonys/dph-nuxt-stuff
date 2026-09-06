import { createKnownError } from '@dphonys/nuxt-handler-errors/internals/server'
import type { OnInvalid } from '@dphonys/nuxt-handler-validation/internals/server'
import { markValidationError } from '@dphonys/nuxt-handler-validation/internals/shared'
import { RESERVED_TAG } from './reserved-tag'

/**
 * Every client-input rejection becomes the one built-in known error,
 * `validationFailed` `400`, carrying both parents' markers so both
 * recognizers answer.
 */
export const onInvalid: OnInvalid = (_source, issues) => {
  const error = createKnownError(RESERVED_TAG, 400, { issues: [...issues] })

  // Beside the marker too: what a client reads once the marker is stripped,
  // at the path the validation parent documents. A second copy, so neither
  // place shares an array with the other or the hook's input.
  ;(error.data as Record<string, unknown>).issues = [...issues]
  markValidationError(error, issues)

  throw error
}
