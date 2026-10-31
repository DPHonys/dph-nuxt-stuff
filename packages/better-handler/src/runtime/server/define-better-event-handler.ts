import type { EventHandlerRequest, H3Event } from 'h3'
import { isRecordLike } from '../shared/guards'
import { makeEventHandler } from '../shared/h3'
import type { ErrorDeclarations } from '../types/errors/declaration'
import type { Fail } from '../types/errors/fail'
import type {
  BetterEventHandler,
  BetterHandlerFn,
  BetterHandlerOptions,
  HandlerContext,
  RouteKnownErrors,
} from '../types/handler'
import type { InputDeclaration, RequestInput } from '../types/io/input'
import { answerThrown } from './errors/boundary'
import { resolveErrors } from './errors/declaration'
import { createFail } from './errors/fail'
import { declarationFault, describeValue } from './faults'
import { sourcePlan, validatedContext } from './io/plan'
import { raiseValidationFailed } from './io/validation-failed'

/**
 * The compile guard's answer for a caller the types never saw: options that
 * are no object, or an `errors` that is no map, would otherwise fail inside
 * the package with a TypeError naming neither. An `input` that is no map is
 * `sourcePlan`'s to refuse.
 */
function checkOptions<
  Input extends InputDeclaration,
  Errors extends ErrorDeclarations,
>(options: BetterHandlerOptions<Input, Errors>): void {
  const given: unknown = options

  if (!isRecordLike(given)) {
    throw declarationFault(
      `defineBetterEventHandler takes its declarations as an object, not ${describeValue(given)}.`
    )
  }

  const errors = 'errors' in given ? given.errors : undefined

  if (errors !== undefined && !isRecordLike(errors)) {
    throw declarationFault(
      `The errors of defineBetterEventHandler must be a map of error declarations keyed by tag, not ${describeValue(errors)}.`
    )
  }
}

/**
 * Declare what a route reads and what it can fail with, and get both from
 * the Handler context:
 *
 * ```ts
 * export default defineBetterEventHandler(
 *   {
 *     input: { route: orderRef, query: pagination },
 *     errors: {
 *       'order-not-found': { status: 404, schema: z.object({ id: z.number() }) },
 *       ...commonErrors,
 *     },
 *   },
 *   async (event, { route, query, fail }) => {
 *     const order = await find(route.id, query.page)
 *     if (!order) throw fail('order-not-found', { id: route.id })
 *     return order
 *   }
 * )
 * ```
 *
 * Each declared Validation source is validated before the Handler is entered,
 * in the order `route -> query -> headers -> body` and stopping at the first
 * that fails, which answers `400` as the Built-in validation-failed variant,
 * `data: { _tag: 'validation-failed', issues }`. The Handler context holds
 * each source's schema output, coercions and transforms applied; reading the
 * body again with `readBody` yields h3's memoized parse, unvalidated.
 *
 * Any thrown value whose `_tag` the route declares in `errors` is a Known
 * error, the Fail helper's result and an Effect error class instance alike:
 * it goes out with the declared status, the tag as `message`, and `data` the
 * Tagged error, the same body to every caller. Everything else propagates as
 * it was thrown. A route declaring only `errors` validates nothing and never
 * reads the body; a route declaring only `input` gets no Fail helper.
 *
 * The declarations are checked here, when the route module is evaluated, so
 * a misdeclared route throws before it serves anything. The returned
 * Handler's type carries the route's Known errors and its Request input,
 * which the generated type map reads to type every call site of the route.
 */
export function defineBetterEventHandler<
  // `{}` is the "declared nothing" default for each half: no key, so no
  // source, no Fail helper and no Built-in validation-failed variant.
  // eslint-disable-next-line ts/no-empty-object-type
  const Input extends InputDeclaration = {},
  // eslint-disable-next-line ts/no-empty-object-type
  const Errors extends ErrorDeclarations = {},
  Response = unknown,
>(
  options: BetterHandlerOptions<Input, Errors>,
  handler: BetterHandlerFn<Input, Errors, Response>
): BetterEventHandler<
  EventHandlerRequest,
  Promise<Awaited<Response>>,
  RouteKnownErrors<Input, Errors>,
  RequestInput<Input>
> {
  checkOptions(options)

  // Errors first, then input, so a route misdeclaring both reports the same
  // fault whichever it wrote first.
  const errors = resolveErrors(options.errors ?? {})
  const plan = options.input === undefined ? [] : sourcePlan(options.input)
  const declaresErrors = Object.keys(errors).length > 0

  // The compile guard's answer for a caller the types never saw. An empty
  // `input` or `errors` validates and raises nothing, so it counts for
  // nothing here either.
  if (plan.length === 0 && !declaresErrors) {
    throw declarationFault(
      'defineBetterEventHandler must declare input, errors, or both.'
    )
  }

  // The Fail helper as `Fail<Errors>` types it, handed over through an `any`
  // result. `createFail` is built over exactly the declarations `Errors`
  // names and refuses at runtime every call the type refuses; what it returns
  // for an accepted call is the `Error` carrying `_tag` and the fields that
  // `FailedError` describes, which no type can prove for a generic `Errors`.
  const runtimeFail: ((tag: string, ...fields: unknown[]) => any) | undefined =
    declaresErrors ? createFail(errors) : undefined
  const fail: Fail<Errors> | undefined = runtimeFail

  return makeEventHandler(
    async (event: H3Event): Promise<Awaited<Response>> => {
      // Before the Handler is entered and outside the boundary below: the
      // variant is raised already built, and an `errors`-only route skips
      // the whole walk, so it never reads the body.
      const validated =
        plan.length === 0
          ? undefined
          : await validatedContext(event, plan, raiseValidationFailed)

      // SAFETY: `validated` is `validatedContext` over this `Input`'s plan,
      // so it holds exactly the sources `Input` declares, each its slot's
      // value; `fail` is defined exactly when `errors` declares a tag. Those
      // are the keys `HandlerContext<Input, Errors>` spells. A fresh object
      // per request, so a Handler may decorate its own.
      const context = (
        fail === undefined ? { ...validated } : { ...validated, fail }
      ) as HandlerContext<Input, Errors>

      // A route without `errors` has no boundary: what its Handler throws
      // propagates as it was thrown.
      if (!declaresErrors) return await handler(event, context)

      try {
        // Awaited inside the `try`, so a rejection is answered as a
        // synchronous throw is.
        return await handler(event, context)
      } catch (thrown) {
        return answerThrown(event, errors, thrown)
      }
    }
  )
}
