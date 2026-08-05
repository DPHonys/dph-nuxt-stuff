/**
 * `@dphonys/nuxt-handler-validation` — typed input validation for Nitro
 * handlers, layered on `@dphonys/nuxt-handler-errors`.
 *
 * **Parked.** See the README for status: this package compiles and tests
 * against the current core so drift is a red build rather than a rotting
 * branch, and it owes no release until it is deliberately admitted.
 */

export { defineValidatedEventHandler, invalidInput } from './define'
export type {
  DefineValidatedEventHandler,
  InferSchemaOutput,
  StandardSchemaV1,
  ValidatedHandlerFn,
  ValidatedInputs,
  ValidationIssue,
  ValidationLocation,
  ValidationShapeGuard,
  ValidationTag,
} from './types'
export {
  hasDeclaredSchemas,
  VALIDATION_LOCATIONS,
  validateDeclaredInput,
} from './validate'
export type { DeclaredSchemas, ValidationOutcome } from './validate'
