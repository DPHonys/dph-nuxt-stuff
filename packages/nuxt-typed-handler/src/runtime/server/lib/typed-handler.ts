import {
  createErrorContext,
  createFail,
  finalizeError,
  resolveDeclared,
} from '@dphonys/nuxt-handler-errors/internals/server'
import type { ErrorDefinitions } from '@dphonys/nuxt-handler-errors/types'
import {
  sourcePlan,
  validatedContext,
} from '@dphonys/nuxt-handler-validation/internals/server'
import type { ValidatedContextOptions } from '@dphonys/nuxt-handler-validation/internals/server'
import type { ValidationSchemas } from '@dphonys/nuxt-handler-validation/types'
import { defineEventHandler } from 'h3'
import type { H3Event } from 'h3'
import type {
  AnyKnownError,
  DefineTypedEventHandler,
} from '../../types/handler'
import { onInvalid } from './on-invalid'
import { assertNoReservedTag } from './reserved-tag'

const VALIDATION_OPTIONS: ValidatedContextOptions = { onInvalid }

/**
 * Declare what a route validates and what it can fail with, and get both in
 * the handler's second parameter: the validated sources, flat, plus local
 * `errors` factories. Throw a factory's result. Either half alone is valid.
 *
 * ```ts
 * export default defineTypedEventHandler(
 *   {
 *     validate: { body: createUser },
 *     errors: { 'user-exists': { status: 409 } }
 *   },
 *   async (event, { body, errors }) => {
 *     if (await exists(body.email)) throw errors['user-exists']()
 *     return create(body)
 *   }
 * )
 * ```
 *
 * A rejected request answers the built-in `validation-failed` variant rather
 * than the validation parent's own `400`; everything else about each half is
 * the parent's, unchanged. Reading the body again with `readBody` yields h3's
 * memoized unvalidated parse.
 * Error `data` schemas accept their input type and expose their validated
 * output under the variant's nested `data` property. Legacy error arrays
 * with a scoped `fail` remain supported but are deprecated.
 */
export const defineTypedEventHandler: DefineTypedEventHandler = (
  options: {
    validate?: ValidationSchemas
    errors?: ErrorDefinitions | readonly AnyKnownError[]
  },
  handler: (event: H3Event, context: never) => any
) => {
  // In this order, so each declaration fault reports with its owner's message.
  const definitions =
    options.errors !== undefined && !Array.isArray(options.errors)
      ? (options.errors as ErrorDefinitions)
      : undefined
  const errorContext =
    definitions === undefined ? undefined : createErrorContext(definitions)
  const declared =
    options.errors !== undefined && definitions === undefined
      ? resolveDeclared(options.errors as readonly AnyKnownError[])
      : undefined
  assertNoReservedTag(definitions ?? declared)
  const plan = options.validate ? sourcePlan(options.validate) : undefined
  const fail = declared === undefined ? undefined : createFail(declared)

  // The compile guard's answer for a JavaScript caller - `validate: {}` plans
  // nothing, so it counts for nothing here either.
  if (
    (plan === undefined || plan.length === 0) &&
    fail === undefined &&
    (errorContext === undefined ||
      Object.keys(errorContext.errors).length === 0)
  ) {
    throw new Error(
      '[nuxt-typed-handler] defineTypedEventHandler needs validate, errors, or both.'
    )
  }

  // Cast because the loose record is typed at this seam and nowhere else.
  const contextFor = (validated: Record<string, unknown>): never =>
    (errorContext !== undefined
      ? { ...validated, ...errorContext }
      : fail === undefined
        ? validated
        : { ...validated, fail }) as never

  if (errorContext !== undefined) {
    return defineEventHandler(async (event) => {
      try {
        const validated =
          plan === undefined
            ? {}
            : await validatedContext(event, plan, VALIDATION_OPTIONS)
        return await handler(event, contextFor(validated))
      } catch (error) {
        return finalizeError(error)
      }
    }) as never
  }

  // No validation call at all on a route that declares none: no body read,
  // no await.
  return defineEventHandler((event) =>
    plan === undefined
      ? handler(event, contextFor({}))
      : validatedContext(event, plan, VALIDATION_OPTIONS).then((validated) =>
          handler(event, contextFor(validated))
        )
  ) as never
}
