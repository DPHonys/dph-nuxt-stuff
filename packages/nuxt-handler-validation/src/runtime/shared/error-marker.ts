import type { H3Error } from 'h3'
import type { ValidationErrorData, ValidationIssue } from '../types/wire'

/**
 * The key a validation failure is marked with, shared by the raise that writes
 * it and the predicate that reads it.
 *
 * `Symbol.for` rather than `Symbol()`: two physical copies of this package in
 * one dependency graph - a Nuxt layer, transitive version skew, an aggregator
 * resolving a different range - must still recognize each other's failures,
 * because silent non-recognition is undebuggable from outside. The risk that
 * admits, someone deliberately planting this key, buys the planter nothing.
 * Versioning is **by key rename**, never a payload flag.
 *
 * A symbol, and never a string on the wire: this marker exists only in-process.
 */
export const VALIDATION_ERROR_KEY: unique symbol = Symbol.for(
  '@dphonys/nuxt-handler-validation:error'
)

/**
 * Hang the marker on a validation failure, so an observability hook can tell a
 * client's bad input from a bug.
 *
 * **Non-enumerable and symbol-keyed**, which is what keeps it out of every
 * copy the error takes on its way out: `JSON.stringify`, an object spread, and
 * Nitro's error handlers all build their body from enumerable string keys, so
 * the marker cannot reach a client and a fetched failure can never be mistaken
 * for a locally raised one.
 *
 * The payload is **this function's own object over its own array**, never the
 * one the error carries as `data`. `data` is enumerable and reachable by every
 * middleware, plugin and error handler in the chain; sharing one object would
 * degrade the predicate's answer from *"what the wrapper raised"* to *"what
 * this error currently says"*. `Object.freeze` on a shared object is worse
 * still - it turns a silent downstream write into a strict-mode `TypeError`,
 * and a 400 into a crash. One extra object plus an array copy, on a failure
 * path, is the right price.
 *
 * The carrier must be an `H3Error`: h3's `createError` is the identity function
 * for values passing its `__h3_error__` duck check, so the marker survives
 * untouched all the way to the Nitro `error` hook - while any other thrown
 * value is re-wrapped into a fresh error that copies `stack`, `data`,
 * `statusCode`, `statusMessage`, `fatal` and `unhandled`, and **no symbols**.
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

/**
 * The marker an error carries, or `undefined`.
 *
 * The shape check is what `Symbol.for` costs: a version-skewed copy of this
 * package sharing the registry key can put anything behind it, and reading a
 * non-null object with an array `issues` makes that read as *unrecognized*
 * rather than as a lie typed `ValidationErrorData`. Walking every issue for
 * `source` / `message` / `path` would traverse an unbounded array on every
 * failure to defend against a payload only this package constructs.
 */
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
