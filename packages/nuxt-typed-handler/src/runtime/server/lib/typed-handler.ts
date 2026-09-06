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
import type {
  RequestInput,
  ValidatedContext,
  ValidationSchemas,
} from '@dphonys/nuxt-handler-validation/types'
import { defineEventHandler } from 'h3'
import type {
  EventHandlerRequest,
  EventHandlerResponse,
  H3Event,
  EventHandler,
} from 'h3'
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

/**
 * The validation parent's per-request door, the one place a request body is
 * read. Injectable so a suite can observe it; the module binds the real one.
 */
export interface TypedHandlerInternals {
  readonly validatedContext: typeof validatedContext
}

/**
 * Build `defineTypedEventHandler` over the given internals. Not a public
 * entry: consumers get the bound export below.
 */
export function createDefineTypedEventHandler(
  internals: TypedHandlerInternals
): DefineTypedEventHandler {
  return <
    const S extends ValidationSchemas,
    const A extends ReadonlyArray<AnyKnownError>,
    Response extends EventHandlerResponse,
    Request extends EventHandlerRequest,
  >(
    options: TypedHandlerOptions<S, A>,
    handler: TypedHandlerFn<S, A, Request, Response>
  ): TypedEventHandler<
    Request,
    Response,
    TypedErrors<S, A>,
    RequestInput<S>
  > => {
    // In this order, so each declaration fault reports with its owner's message.
    const declared = resolveDeclared(options.errors ?? [])
    assertNoReservedTag(declared)
    const errorContext =
      declared.length === 0 ? undefined : createErrorContext(declared)
    const plan = options.validate ? sourcePlan<S>(options.validate) : undefined

    // The compile guard's answer for a JavaScript caller - `validate: {}` plans
    // nothing, so it counts for nothing here either.
    if (
      (plan === undefined || plan.length === 0) &&
      errorContext === undefined
    ) {
      throw new Error(
        '[nuxt-typed-handler] defineTypedEventHandler needs validate, errors, or both.'
      )
    }

    // A fresh object per request, so a handler may decorate its own context.
    // Validation-only routes keep the parent's context without a factories slot.
    // `undefined` when there is no plan: nothing validated, and `S` is `{}`.
    const contextFor = (
      validated: ValidatedContext<S> | undefined
    ): TypedContext<S, A> =>
      // SAFETY: the plan is `sourcePlan(options.validate)`, so `validated`
      // holds exactly the sources `S` declares, each its schema's output; and
      // `errorContext.errors` holds one factory per tag `A` declares. Those
      // two halves are `TypedContext<S, A>` by definition.
      ({ ...validated, ...errorContext }) as TypedContext<S, A>

    const eventHandler: EventHandler<Request, Response | Promise<Response>> =
      defineEventHandler((event: H3Event<Request>) =>
        plan === undefined
          ? handler(event, contextFor(undefined))
          : internals
              .validatedContext(event, plan, VALIDATION_OPTIONS)
              .then((validated) => handler(event, contextFor(validated)))
      )

    // SAFETY: h3 awaits every handler's result and Nitro types the route
    // through `Awaited<>`, so the validating branch's `Promise<Response>`
    // serves exactly as `Response` does. Both phantom slots are optional and
    // never assigned; the value is h3's own handler.
    return eventHandler as TypedEventHandler<
      Request,
      Response,
      TypedErrors<S, A>,
      RequestInput<S>
    >
  }
}

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
export const defineTypedEventHandler: DefineTypedEventHandler =
  createDefineTypedEventHandler({ validatedContext })
