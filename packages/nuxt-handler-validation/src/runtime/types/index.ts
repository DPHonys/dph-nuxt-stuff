/**
 * The type-only entry. Nothing here may carry a runtime value: a component
 * annotating a caught failure imports from `@dphonys/nuxt-handler-validation/types`
 * and must not drag h3 into the client bundle.
 *
 * A barrel over the leaf modules, and the whole public type surface - what is
 * not re-exported here is internal, `DefineValidatedEventHandler` and `IsAny`
 * included.
 */

export type {
  ValidateSchemas,
  ValidatedContext,
  ValidationSource,
} from './schemas'

export type { SchemasOfHandler, ValidatedEventHandler } from './handler'

export type { ValidationErrorData, ValidationIssue } from './wire'
