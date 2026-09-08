import type { H3Error } from 'h3'
import { z } from 'zod'
import type { ValidationErrorData, ValidationIssue } from '../types'
import { VALIDATION_SOURCES } from './sources'

// `Symbol.for` rather than `Symbol()`, so two physical copies of this package
// in one dependency graph still recognize each other's failures. Versioning is
// by key rename.
export const VALIDATION_ERROR_KEY: unique symbol = Symbol.for(
  '@dphonys/nuxt-handler-validation:error'
)

/**
 * Hang the marker on a validation failure, so an observability hook can tell a
 * client's bad input from a bug. Non-enumerable and symbol-keyed, so it
 * survives none of the copies the error takes on its way out; and it is this
 * function's own snapshot, sharing no object with the enumerable `data` a
 * middleware downstream can edit.
 *
 * The carrier must be an `H3Error`: h3's `createError` is the identity function
 * for values passing its `__h3_error__` duck check, while any other thrown
 * value is re-wrapped into a fresh error that copies no symbols.
 */
export function markValidationError(
  error: H3Error,
  issues: readonly ValidationIssue[]
): void {
  // Copied down to the `path` array: a shallow copy would leave every issue
  // object shared with `data.issues`, where an edit in place still reaches here.
  const marked: ValidationErrorData = {
    issues: issues.map((issue) => ({ ...issue, path: [...issue.path] })),
  }

  Object.defineProperty(error, VALIDATION_ERROR_KEY, {
    value: marked,
    enumerable: false,
  })
}

/** The marker's shape, as `markValidationError` writes it. */
const MARKER = z.object({
  issues: z.array(
    z.object({
      source: z.enum(VALIDATION_SOURCES),
      message: z.string(),
      path: z.array(z.union([z.string(), z.number()])),
    })
  ),
})

/**
 * The marker a validation failure carries, or `undefined` for anything else.
 *
 * Parsed rather than trusted, which is what `Symbol.for` costs: a
 * version-skewed copy sharing the registry key can put anything behind it,
 * and that must read as unrecognized. What comes back is the parse's own
 * copy, so a hook editing it edits no marker.
 */
export function readValidationMarker(
  error: Error
): ValidationErrorData | undefined {
  // Typed as the `Error` every hook is handed; tolerated as anything, because
  // a JavaScript hook passes on whatever it was given.
  if (!(error instanceof Object) || !(VALIDATION_ERROR_KEY in error)) {
    return undefined
  }

  return MARKER.safeParse(error[VALIDATION_ERROR_KEY]).data
}
