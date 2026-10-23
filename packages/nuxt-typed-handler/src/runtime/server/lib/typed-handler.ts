import {
  createErrorContext,
  resolveDeclared,
} from '@dphonys/nuxt-handler-errors/internals/server'
import type { AnyKnownError } from '@dphonys/nuxt-handler-errors/types'
import {
  responseDelivery,
  sourcePlan,
  validatedContext,
} from '@dphonys/nuxt-handler-validation/internals/server'
import type { ValidatedContextOptions } from '@dphonys/nuxt-handler-validation/internals/server'
import type {
  HandlerReturn,
  RequestInput,
  ResponseOutput,
  ResponseOutputs,
  SentResponse,
  ValidatedContext,
  ValidationSchemas,
} from '@dphonys/nuxt-handler-validation/types'
import { defineEventHandler } from 'h3'
import type { EventHandlerRequest, EventHandlerResponse, H3Event } from 'h3'
import type {
  DefineTypedEventHandler,
  TypedContext,
  TypedErrors,
  TypedEventHandler,
  TypedHandlerFn,
  TypedHandlerOptions,
} from '../../types/handler'
import { onInvalid } from './on-invalid'
import { assertNoReservedTag } from './reserved-tag'

const VALIDATION_OPTIONS: ValidatedContextOptions = { onInvalid }

/** What a declaration of `S`, `A` and `O` builds, spelled once. */
type Handler<
  S extends ValidationSchemas,
  A extends ReadonlyArray<AnyKnownError>,
  O extends ResponseOutput | undefined,
  Request extends EventHandlerRequest,
  Response extends EventHandlerResponse,
> = TypedEventHandler<
  Request,
  SentResponse<O, Response>,
  TypedErrors<S, A>,
  RequestInput<S>,
  ResponseOutputs<O>
>

/**
 * Declare what a route validates and what it can fail with, and get both in
 * the handler's second parameter: the validated sources, flat, plus local
 * `errors` factories. Throw a factory's result. Either half alone is valid.
 *
 * ```ts
 * export default defineTypedEventHandler(
 *   {
 *     input: { body: createUser },
 *     errors: [defineError('user-exists', { status: 409 })],
 *     output: user
 *   },
 *   async (event, { body, errors }) => {
 *     if (await exists(body.email)) throw errors.userExists()
 *     return create(body)
 *   }
 * )
 * ```
 *
 * A rejected request answers the built-in `validation-failed` variant rather
 * than the validation parent's own `400`; everything else about each half is
 * the parent's, unchanged. `output` is the parent's too: a bare schema
 * declares one `200` the handler returns plainly, a status map declares one
 * reply per status and puts `respond` in the context to answer through, both
 * checked by the compiler and, on a development server, asserted against the
 * declared schema before the value goes out untouched. Reading the body again
 * with `readBody` yields h3's memoized unvalidated parse.
 * Error payload schemas accept their input type and expose their validated
 * output as flat fields on the variant.
 */
export const defineTypedEventHandler: DefineTypedEventHandler = <
  const S extends ValidationSchemas,
  const A extends ReadonlyArray<AnyKnownError>,
  O extends ResponseOutput | undefined,
  Response extends EventHandlerResponse<HandlerReturn<O>>,
  Request extends EventHandlerRequest,
>(
  options: TypedHandlerOptions<S, A, O>,
  handler: TypedHandlerFn<S, A, Request, Response, O>
): Handler<S, A, O, Request, Response> => {
  // In this order, so each declaration fault reports with its owner's message.
  const declared = resolveDeclared(options.errors ?? [])
  assertNoReservedTag(declared)
  const errorContext =
    declared.length === 0 ? undefined : createErrorContext(declared)
  const plan = options.input ? sourcePlan<S>(options.input) : undefined

  // The compile guard's answer for a JavaScript caller - `input: {}` plans
  // nothing, so it counts for nothing here either.
  if (
    (plan === undefined || plan.length === 0) &&
    errorContext === undefined &&
    options.output === undefined
  ) {
    throw new Error(
      '[nuxt-typed-handler] defineTypedEventHandler must declare input, errors, output, or any combination.'
    )
  }

  // Read once, when the route file is evaluated: a route the helper was never
  // offered to pays nothing per request for it, and an `output` naming no reply
  // at all is refused here rather than served.
  const delivery = responseDelivery(options.output)

  // A fresh object per request, so a handler may decorate its own context.
  // Validation-only routes keep the parent's context without a factories slot.
  const contextFor = (
    validated: ValidatedContext<S> | undefined
  ): TypedContext<S, A, O> =>
    // SAFETY: the plan is `sourcePlan(options.input)`, so `validated`
    // holds exactly the sources `S` declares, each its schema's output;
    // `errorContext.errors` holds one factory per tag `A` declares; and
    // `respond` joins them exactly when `O` is the status map that offers it.
    // Those halves are `TypedContext<S, A, O>` by definition.
    ({
      ...validated,
      ...errorContext,
      ...delivery.respondSlot,
    }) as TypedContext<S, A, O>

  // SAFETY: h3 awaits every handler's result and Nitro types the route
  // through `Awaited<>`, so this branch's `Promise<Response>` serves exactly
  // as `Response` does - and for a status map the public signature reports
  // the union of the mapped bodies the envelope is unwrapped to. Both phantom
  // slots are optional and never assigned; the value is h3's own handler.
  return defineEventHandler(async (event: H3Event<Request>) => {
    const validated =
      plan === undefined
        ? undefined
        : await validatedContext(event, plan, VALIDATION_OPTIONS)
    const returned = await handler(event, contextFor(validated))

    return delivery.send(event, returned)
  }) as Handler<S, A, O, Request, Response>
}
