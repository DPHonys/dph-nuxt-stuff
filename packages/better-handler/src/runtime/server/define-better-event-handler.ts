import type { H3Event } from 'h3'
import { makeEventHandler } from '../shared/h3'
import type { ErrorDeclarations } from '../types/errors/declaration'
import type { Fail } from '../types/errors/fail'
import type {
  BetterEventHandler,
  BetterHandlerFn,
  BetterHandlerOptions,
} from '../types/handler'
import { answerThrown } from './errors/boundary'
import { resolveErrors } from './errors/declaration'
import { createFail } from './errors/fail'

/**
 * Declare what a route can fail with, and raise it from the Handler context:
 *
 * ```ts
 * export default defineBetterEventHandler(
 *   {
 *     errors: {
 *       'order-not-found': { status: 404, schema: z.object({ id: z.number() }) },
 *       'order-locked': { status: 409 },
 *       ...commonErrors,
 *     },
 *   },
 *   async (event, { fail }) => {
 *     const id = Number(getRouterParam(event, 'id'))
 *     const order = await find(id)
 *     if (!order) throw fail('order-not-found', { id })
 *     if (order.locked) throw fail('order-locked')
 *     return order
 *   }
 * )
 * ```
 *
 * Any thrown value whose `_tag` the route declares is a Known error, the Fail
 * helper's result and an Effect error class instance alike: it goes out with
 * the declared status, the tag as `message`, and `data` the Tagged error, the
 * same body to every caller. Everything else propagates as it was thrown.
 *
 * The declarations are checked here, when the route module is evaluated, so
 * a misdeclared route throws before it serves anything.
 */
export function defineBetterEventHandler<
  const Errors extends ErrorDeclarations,
  Response,
>(
  options: BetterHandlerOptions<Errors>,
  handler: BetterHandlerFn<Errors, Response>
): BetterEventHandler<Response> {
  const errors = resolveErrors(options.errors)

  // The Fail helper as `Fail<Errors>` types it, handed over through an `any`
  // result. `createFail` is built over exactly the declarations `Errors`
  // names and refuses at runtime every call the type refuses; what it returns
  // for an accepted call is the `Error` carrying `_tag` and the fields that
  // `FailedError` describes, which no type can prove for a generic `Errors`.
  const runtimeFail: (tag: string, ...fields: unknown[]) => any =
    createFail(errors)
  const fail: Fail<Errors> = runtimeFail

  return makeEventHandler(
    async (event: H3Event): Promise<Awaited<Response>> => {
      try {
        // A fresh object per request, so a Handler may decorate its own.
        // Awaited inside the `try`, so a rejection is answered as a
        // synchronous throw is.
        return await handler(event, { fail })
      } catch (thrown) {
        return answerThrown(event, errors, thrown)
      }
    }
  )
}
