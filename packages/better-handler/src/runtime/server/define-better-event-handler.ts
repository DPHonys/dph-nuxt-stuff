import type { EventHandlerRequest, EventHandlerResponse, H3Event } from 'h3'
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
import type {
  HandlerReturn,
  ResponseOutput,
  ResponseOutputs,
  SentResponse,
} from '../types/io/output'
import { answerThrown } from './errors/boundary'
import { resolveErrors } from './errors/declaration'
import { createFail } from './errors/fail'
import { declarationFault, describeValue } from './faults'
import { sourcePlan, validatedContext } from './io/plan'
import type { RespondFn } from './io/respond'
import { responseDelivery } from './io/respond'
import { raiseValidationFailed } from './io/validation-failed'

/** The helpers a route's declaration earns its Handler context. */
interface ContextHelpers<Errors extends ErrorDeclarations> {
  fail?: Fail<Errors>
  respond?: RespondFn
}

/**
 * The compile guard's answer for a caller the types never saw: options that
 * are no object, or an `errors` that is no map, would otherwise fail inside
 * the package with a TypeError naming neither. An `input` that is no map is
 * `sourcePlan`'s to refuse, and an `output` of neither form
 * `responseDelivery`'s.
 */
function checkOptions<
  Input extends InputDeclaration,
  Errors extends ErrorDeclarations,
  Output extends ResponseOutput | undefined,
>(options: BetterHandlerOptions<Input, Errors, Output>): void {
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
 * Declare what a route reads, what it answers with and what it can fail
 * with, and get all three from the Handler context:
 *
 * ```ts
 * export default defineBetterEventHandler(
 *   {
 *     input: { route: orderRef, query: pagination },
 *     output: { 200: order, 204: null },
 *     errors: {
 *       'order-not-found': { status: 404, schema: z.object({ id: z.number() }) },
 *       ...commonErrors,
 *     },
 *   },
 *   async (event, { route, query, respond, fail }) => {
 *     const order = await find(route.id, query.page)
 *     if (!order) throw fail('order-not-found', { id: route.id })
 *     return respond(200, order)
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
 * `output: schema` declares one `200` reply: the Handler returns the schema's
 * input type plainly, and the route answers `200` whatever status was set
 * before. `output: { 200: a, 201: b, 204: null }` declares a status map, each
 * key a status from 100 to 399 (a failure is declared under `errors`): the
 * Handler context gains the Respond helper and the Handler returns
 * `respond(status, value)`, one status literal at a time, or
 * `respond(status)` for a status declared `null`, which sends no body
 * whatever was passed. Nothing runs the schema in production; a development
 * server asserts the handed-over value against the schema its status
 * declares, refuses an undeclared status, and discards the result, so both
 * send the same bytes.
 *
 * Any thrown value whose `_tag` the route declares in `errors` is a Known
 * error, the Fail helper's result and an Effect error class instance alike:
 * it goes out with the declared status, the tag as `message`, and `data` the
 * Tagged error, the same body to every caller. Everything else propagates as
 * it was thrown. A route declaring no `input` validates nothing and never
 * reads the body; a route declaring no `errors` gets no Fail helper.
 *
 * The declarations are checked here, when the route module is evaluated, so
 * a misdeclared route throws before it serves anything. The returned
 * Handler's type carries the route's Known errors, its Request input and its
 * Response output, which the generated type map reads to type every call
 * site of the route.
 */
export function defineBetterEventHandler<
  // `{}` is the "declared nothing" default for each map: no key, so no
  // source, no Fail helper and no Built-in validation-failed variant.
  // eslint-disable-next-line ts/no-empty-object-type
  const Input extends InputDeclaration = {},
  // eslint-disable-next-line ts/no-empty-object-type
  const Errors extends ErrorDeclarations = {},
  Output extends ResponseOutput | undefined = undefined,
  Response extends EventHandlerResponse<HandlerReturn<Output>> =
    EventHandlerResponse<HandlerReturn<Output>>,
>(
  options: BetterHandlerOptions<Input, Errors, Output>,
  handler: BetterHandlerFn<Input, Errors, Output, Response>
): BetterEventHandler<
  EventHandlerRequest,
  Promise<SentResponse<Output, Response>>,
  RouteKnownErrors<Input, Errors>,
  RequestInput<Input>,
  ResponseOutputs<Output>
> {
  checkOptions(options)

  // Errors, then input, then output, so a route misdeclaring several reports
  // the same fault whichever it wrote first.
  const errors = resolveErrors(options.errors ?? {})
  const plan = options.input === undefined ? [] : sourcePlan(options.input)
  const delivery = responseDelivery(options.output)
  const declaresErrors = Object.keys(errors).length > 0

  // The compile guard's answer for a caller the types never saw. An empty
  // `input`, `errors` or `output` map validates, raises and sends nothing, so
  // it counts for nothing here either.
  if (plan.length === 0 && !declaresErrors && !delivery.declared) {
    throw declarationFault(
      'defineBetterEventHandler must declare input, errors, output, or any combination.'
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

  // The helpers every request's context carries, settled once: each present
  // exactly when its declaration earns it.
  const helpers: ContextHelpers<Errors> = {}

  if (fail !== undefined) helpers.fail = fail
  if (delivery.respond !== undefined) helpers.respond = delivery.respond

  return makeEventHandler(
    async (event: H3Event): Promise<SentResponse<Output, Response>> => {
      // Before the Handler is entered and outside the boundary below: the
      // variant is raised already built, and a route without `input` skips
      // the whole walk, so it never reads the body.
      const validated =
        plan.length === 0
          ? undefined
          : await validatedContext(event, plan, raiseValidationFailed)

      // SAFETY: `validated` is `validatedContext` over this `Input`'s plan,
      // so it holds exactly the sources `Input` declares, each its slot's
      // value; `helpers` holds `fail` exactly when `errors` declares a tag
      // and `respond` exactly when `output` is a status map naming a status.
      // Those are the keys `HandlerContext<Input, Errors, Output>` spells. A
      // fresh object per request, so a Handler may decorate its own.
      const context = { ...validated, ...helpers } as HandlerContext<
        Input,
        Errors,
        Output
      >

      // Sent outside the boundary, so a refusal of the response is never
      // read as something the Handler threw.
      // SAFETY: `send` hands back the Handler's own value for a route without
      // `output` and for the bare form, whose value the return constraint
      // typed as the schema's input, and for a status map the body the
      // Respond helper carried, which `Respond` typed as its status's body -
      // or `null` for a status declared `null`. That is what `SentResponse`
      // spells for each form; the compiler only sees h3's untyped
      // `EventHandlerResponse`.
      return (await delivery.send(
        event,
        await answered(event, context)
      )) as SentResponse<Output, Response>
    }
  )

  /**
   * The Handler's settled return. A route without `errors` has no boundary:
   * what its Handler throws propagates as it was thrown.
   */
  async function answered(
    event: H3Event,
    context: HandlerContext<Input, Errors, Output>
  ): Promise<Awaited<Response>> {
    if (!declaresErrors) return await handler(event, context)

    try {
      // Awaited inside the `try`, so a rejection is answered as a
      // synchronous throw is.
      return await handler(event, context)
    } catch (thrown) {
      return answerThrown(event, errors, thrown)
    }
  }
}
