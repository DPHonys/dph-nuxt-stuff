import {
  createFail,
  resolveDeclared,
} from '@dphonys/nuxt-handler-errors/internals/server'
import {
  sourcePlan,
  validatedContext,
} from '@dphonys/nuxt-handler-validation/internals/server'
import type { ValidatedContextOptions } from '@dphonys/nuxt-handler-validation/internals/server'
import { defineEventHandler } from 'h3'
import type { DefineTypedEventHandler } from '../../types/handler'
import { onInvalid } from './on-invalid'
import { assertNoReservedTag } from './reserved-tag'

const VALIDATION_OPTIONS: ValidatedContextOptions = { onInvalid }

/**
 * Declare what a route validates and what it can fail with, and get both in
 * the handler's second parameter: the validated sources, flat, plus `fail`
 * scoped to the declared errors. Either half alone is valid.
 *
 * ```ts
 * export default defineTypedEventHandler(
 *   { validate: { body: createUser }, errors: [...userErrors] },
 *   async (event, { body, fail }) => {
 *     if (await exists(body.email)) return fail('user-exists')
 *     return create(body)
 *   }
 * )
 * ```
 *
 * A rejected request answers the built-in `validation-failed` variant rather
 * than the validation parent's own `400`; everything else about each half is
 * the parent's, unchanged. Reading the body again with `readBody` yields h3's
 * memoized unvalidated parse.
 */
export const defineTypedEventHandler: DefineTypedEventHandler = (
  options,
  handler
) => {
  // In this order, so each declaration fault reports with its owner's message.
  const declared = options.errors ? resolveDeclared(options.errors) : undefined
  assertNoReservedTag(declared)
  const plan = options.validate ? sourcePlan(options.validate) : undefined
  const fail = declared === undefined ? undefined : createFail(declared)

  // The compile guard's answer for a JavaScript caller.
  if (plan === undefined && fail === undefined) {
    throw new Error(
      '[nuxt-typed-handler] defineTypedEventHandler needs validate, errors, or both.'
    )
  }

  // Cast because the loose record is typed at this seam and nowhere else.
  const contextFor = (validated: Record<string, unknown>): never =>
    (fail === undefined ? validated : { ...validated, fail }) as never

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
