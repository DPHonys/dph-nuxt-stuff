import type { H3Error } from 'h3'
import type { ValidationErrorData, ValidationIssue } from '../types'

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
 * function's own object, never the `data` middleware downstream can edit.
 *
 * The carrier must be an `H3Error`: h3's `createError` is the identity function
 * for values passing its `__h3_error__` duck check, while any other thrown
 * value is re-wrapped into a fresh error that copies no symbols.
 */
export function markValidationError(
  error: H3Error,
  issues: readonly ValidationIssue[]
): void {
  const marked: ValidationErrorData = { issues: [...issues] }

  Object.defineProperty(error, VALIDATION_ERROR_KEY, {
    value: marked,
    enumerable: false,
  })
}

// The shape check is what `Symbol.for` costs: a version-skewed copy sharing the
// registry key can put anything behind it, and that must read as unrecognized.
export function readValidationMarker(
  error: unknown
): ValidationErrorData | undefined {
  const marker = (error as Record<symbol, unknown> | null | undefined)?.[
    VALIDATION_ERROR_KEY
  ]

  return typeof marker === 'object' &&
    marker !== null &&
    Array.isArray((marker as ValidationErrorData).issues)
    ? (marker as ValidationErrorData)
    : undefined
}
