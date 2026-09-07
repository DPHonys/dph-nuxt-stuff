import type { EventHandlerRequest, EventHandlerResponse, H3Event } from 'h3'
import { defineEventHandler } from 'h3'
import { readValidationMarker } from '../shared/error-marker'
import type {
  RequestInput,
  ValidatedContext,
  ValidatedEventHandler,
  ValidationErrorData,
  ValidationSchemas,
  ValidationSchemasGuard,
} from '../types'
import { sourcePlan, validatedContext } from './lib/validate'

/**
 * Declare what a route validates, and get the validated values eagerly in the
 * handler's second parameter. Undeclared sources are absent from it rather than
 * `unknown`, and the returned handler is an ordinary h3 `EventHandler` that
 * additionally carries the computed Request input as a phantom type slot.
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
): ValidatedEventHandler<Request, Response, RequestInput<S>> {
  // Planned over `S` alone: the guard is a compile-time refusal, not a slot.
  const plan = sourcePlan<S>(options.validate)

  // SAFETY: `defineEventHandler` types its product by the one promise the
  // wrapper always returns, while the public signature reports the handler's
  // own `Response`, so Nitro's typed routes see the success type rather than
  // the wrapper's promise of it. The phantom Request-input slot is optional and
  // never assigned, so the h3 handler satisfies it as it is.
  return defineEventHandler(async (event: H3Event<Request>) =>
    handler(event, await validatedContext(event, plan))
  ) as ValidatedEventHandler<Request, Response, RequestInput<S>>
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
 * Takes the `Error` a hook is handed; a `catch` narrows with `instanceof Error`
 * first, since only an `Error` can carry the marker. Only a `400` validation
 * failure is marked - every developer mistake this package raises carries no
 * marker, so the early return cannot swallow a bug. The marker is a
 * non-serialized symbol: recognition works on the live server error, never on
 * a payload that already crossed the wire.
 */
// The sibling's recognizer also checks `unhandled === false`; that half is
// dropped here because the non-serialized marker already cannot cross the wire.
export function recognizeValidationError(
  error: Error
): ValidationErrorData | undefined {
  // The symbol and nothing else - never `error.cause`, because a deliberate
  // re-wrap is the caller choosing to raise a report of their own.
  return readValidationMarker(error)
}
