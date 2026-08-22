import { createKnownError } from '@dphonys/nuxt-handler-errors/internals/server'
import type { OnInvalid } from '@dphonys/nuxt-handler-validation/internals/server'
import { markValidationError } from '@dphonys/nuxt-handler-validation/internals/shared'
import { RESERVED_TAG } from './reserved-tag'

/**
 * The built-in variant's raiser: every client-input rejection the validation
 * parent reports - a rejecting schema and an unparseable body alike - becomes
 * one known error, `validation-failed`, `400`, with the issues both inside the
 * known-error marker and at `data.issues`, plus the validation marker. Both
 * parents' recognizers answer, and channel stripping leaves `data.issues`.
 */
export const onInvalid: OnInvalid = (_source, issues) => {
  const error = createKnownError(RESERVED_TAG, 400, { issues: [...issues] })

  // Beside the marker, not inside it: what a client reads once the marker is
  // stripped, and the path the validation parent documents. A second copy on
  // purpose, so neither place shares an array with the other or the hook's
  // input.
  ;(error.data as Record<string, unknown>).issues = [...issues]
  markValidationError(error, issues)

  throw error
}
