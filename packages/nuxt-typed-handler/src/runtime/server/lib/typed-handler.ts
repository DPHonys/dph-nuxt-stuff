import {
  createErrorContext,
  resolveDeclared,
} from '@dphonys/nuxt-handler-errors/internals/server'
import type { AnyKnownError } from '@dphonys/nuxt-handler-errors/types'
import {
  sourcePlan,
  validatedContext,
} from '@dphonys/nuxt-handler-validation/internals/server'
import type { ValidatedContextOptions } from '@dphonys/nuxt-handler-validation/internals/server'
import type { ValidationSchemas } from '@dphonys/nuxt-handler-validation/types'
import { defineEventHandler } from 'h3'
import type { H3Event } from 'h3'
import type { DefineTypedEventHandler } from '../../types/handler'
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
 *     errors: [defineError('userExists', { status: 409 })]
 *   },
 *   async (event, { body, errors }) => {
 *     if (await exists(body.email)) throw errors.userExists()
 *     return create(body)
 *   }
 * )
 * ```
 *
 * A rejected request answers the built-in `validationFailed` variant rather
 * than the validation parent's own `400`; everything else about each half is
 * the parent's, unchanged. Reading the body again with `readBody` yields h3's
 * memoized unvalidated parse.
 * Error payload schemas accept their input type and expose their validated
 * output as flat fields on the variant.
 */
export const defineTypedEventHandler: DefineTypedEventHandler = (
  options: {
    validate?: ValidationSchemas
    errors?: readonly AnyKnownError[]
  },
  handler: (event: H3Event, context: never) => any
) => {
  // In this order, so each declaration fault reports with its owner's message.
  const declared = resolveDeclared(options.errors ?? [])
  assertNoReservedTag(declared)
  const errorContext =
    declared.length === 0 ? undefined : createErrorContext(declared)
  const plan = options.validate ? sourcePlan(options.validate) : undefined

  // The compile guard's answer for a JavaScript caller - `validate: {}` plans
  // nothing, so it counts for nothing here either.
  if ((plan === undefined || plan.length === 0) && errorContext === undefined) {
    throw new Error(
      '[nuxt-typed-handler] defineTypedEventHandler needs validate, errors, or both.'
    )
  }

  // A fresh object per request, so a handler may decorate its own context.
  // Validation-only routes keep the parent's context without a factories slot.
  // Cast because the loose record is typed at this seam and nowhere else.
  const contextFor = (validated: Record<string, unknown>): never =>
    ({ ...validated, ...errorContext }) as never

  return defineEventHandler((event) =>
    plan === undefined
      ? handler(event, contextFor({}))
      : validatedContext(event, plan, VALIDATION_OPTIONS).then((validated) =>
          handler(event, contextFor(validated))
        )
  ) as never
}
