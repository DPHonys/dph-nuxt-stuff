// The `/server` entry - the whole runtime surface. No `@nuxt/kit` runtime may
// be reachable from here; `test/unit/core-layering.test.ts` guards it.
import type {
  EventHandler,
  EventHandlerRequest,
  EventHandlerResponse,
  H3Event,
} from 'h3'
import { defineEventHandler } from 'h3'
import { readValidationMarker } from '../shared/error-marker'
import type {
  ValidatedContext,
  ValidationErrorData,
  ValidationSchemas,
} from '../types'
import type { ValidationSchemasGuard } from '../types/internal'
import { sourcePlan, validatedContext } from './lib/validate'

/**
 * Declare what a route validates, and get the validated values eagerly in the
 * handler's second parameter. Undeclared sources are absent from it rather than
 * `unknown`, and the returned handler is an ordinary h3 `EventHandler`.
 *
 * Sources validate in the order `routerParams -> query -> headers -> body`,
 * fail-fast across sources: the first failure answers `400` and no later source
 * is read, while issues within one source arrive together. The second parameter
 * is the only door to the validated values - reading the body again with
 * `readBody` yields h3's memoized unvalidated parse.
 */
// `Response` has no default type parameter on purpose: an explicit type
// argument becomes an arity error instead of collapsing the success type.
export function defineValidatedEventHandler<
  const S extends ValidationSchemas,
  Response extends EventHandlerResponse,
  Request extends EventHandlerRequest = EventHandlerRequest,
>(
  options: { validate: S & ValidationSchemasGuard<S> },
  handler: (event: H3Event<Request>, validated: ValidatedContext<S>) => Response
): EventHandler<Request, Response> {
  const plan = sourcePlan(options.validate)

  // Cast because the wrapper always hands h3 one promise, while the public
  // signature reports the handler's own `Response` for Nitro's typed routes.
  return defineEventHandler(async (event: H3Event<Request>) =>
    handler(event, (await validatedContext(event, plan)) as ValidatedContext<S>)
  ) as EventHandler<Request, Response>
}

/**
 * The issues a validation failure raised, or `undefined` for "not a validation
 * failure" - for a Nitro `error` hook or a Sentry `beforeSend`.
 *
 * ```ts
 * nitroApp.hooks.hook('error', (error) => {
 *   if (recognizeValidationError(error)) return
 *   report(error)
 * })
 * ```
 *
 * Only a `400` validation failure is marked - every developer mistake this
 * package raises carries no marker, so the early return cannot swallow a bug.
 * Drop the sibling's `unhandled === false` half here: this marker is a
 * non-serialized symbol, so a marked payload cannot return across the wire.
 */
export function recognizeValidationError(
  error: unknown
): ValidationErrorData | undefined {
  // The symbol and nothing else - never `error.cause`, because a deliberate
  // re-wrap is the caller choosing to raise a report of their own.
  return readValidationMarker(error)
}
