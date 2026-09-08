import type { EventHandlerRequest, EventHandlerResponse, H3Event } from 'h3'
import { defineEventHandler } from 'h3'
import { readValidationMarker } from '../shared/error-marker'
import type {
  RequestInput,
  ResponseBody,
  ResponseOutput,
  ResponseOutputs,
  ValidatedContext,
  ValidatedEventHandler,
  ValidatedHandlerOptions,
  ValidationErrorData,
  ValidationSchemas,
} from '../types'
import { sourcePlan, validatedContext } from './lib/validate'

/**
 * Declare what a route validates and what it answers with, and get the
 * validated values eagerly in the handler's second parameter. Undeclared
 * sources are absent from it rather than `unknown`, and the returned handler is
 * an ordinary h3 `EventHandler` that additionally carries the computed Request
 * input and the declared Response output as phantom type slots.
 *
 * Sources validate in the order `route -> query -> headers -> body`,
 * fail-fast across sources: the first failure answers `400` and no later source
 * is read, while issues within one source arrive together. The second parameter
 * is the only door to the validated values - reading the body again with
 * `readBody` yields h3's memoized unvalidated parse.
 *
 * `output: schema` declares one `200` reply: the handler's plain return is
 * constrained to the schema's _output_ type. Nothing runs the schema, so what
 * the handler returns is what the client receives. Either half alone is a
 * declaration; `{}` is neither, and is refused.
 */
// Every type parameter carries a default, because both halves of the
// declaration are optional: `S` has to read `{}` rather than the whole
// interface for the guard to see an output-only route as declaring no source.
export function defineValidatedEventHandler<
  // eslint-disable-next-line ts/no-empty-object-type
  const S extends ValidationSchemas = {},
  O extends ResponseOutput | undefined = undefined,
  Response extends EventHandlerResponse<ResponseBody<O>> = EventHandlerResponse<
    ResponseBody<O>
  >,
  Request extends EventHandlerRequest = EventHandlerRequest,
>(
  options: ValidatedHandlerOptions<S, O>,
  handler: (event: H3Event<Request>, validated: ValidatedContext<S>) => Response
): ValidatedEventHandler<
  Request,
  Response,
  RequestInput<S>,
  ResponseOutputs<O>
> {
  // Planned over `S` alone: the guard is a compile-time refusal, not a slot.
  const plan =
    options.input === undefined ? undefined : sourcePlan<S>(options.input)

  // The compile guard's answer for a JavaScript caller - `input: {}` plans
  // nothing, so it counts for nothing here either.
  if (
    (plan === undefined || plan.length === 0) &&
    options.output === undefined
  ) {
    throw new Error(
      '[nuxt-handler-validation] defineValidatedEventHandler must declare input, output, or both.'
    )
  }

  // SAFETY: `defineEventHandler` types its product by the one promise the
  // wrapper always returns, while the public signature reports the handler's
  // own `Response`, so Nitro's typed routes see the success type rather than
  // the wrapper's promise of it. An output-only route validates nothing, so its
  // `ValidatedContext<S>` has no keys and a fresh `{}` is the whole of it - one
  // per request, so a handler may decorate its own context. Both phantom slots
  // are optional and never assigned, so the h3 handler satisfies them as it is.
  return defineEventHandler(async (event: H3Event<Request>) =>
    plan === undefined
      ? handler(event, {} as ValidatedContext<S>)
      : handler(event, await validatedContext(event, plan))
  ) as ValidatedEventHandler<
    Request,
    Response,
    RequestInput<S>,
    ResponseOutputs<O>
  >
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
