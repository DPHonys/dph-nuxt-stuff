import type { ValidationSource } from './schemas'

/**
 * One projected issue - the whole of what a client is told about a rejected
 * value. Raw Standard Schema issues never reach it; `path` is normalized to
 * strings and numbers.
 */
export interface ValidationIssue {
  source: ValidationSource
  message: string
  path: Array<string | number>
}

/**
 * One shape read on both sides: the h3 error's `data` payload on the wire, and
 * what `recognizeValidationError` hands an observability hook.
 *
 * A *fetched* failure sits at `err.data.data.issues` - ofetch's
 * `FetchError.data` is the whole Nitro body, and this payload is that body's
 * `data`.
 */
export interface ValidationErrorData {
  issues: ValidationIssue[]
}
