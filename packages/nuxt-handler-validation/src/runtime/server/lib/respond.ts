import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { EventHandlerResponse, H3Event } from 'h3'
import { createError, setResponseStatus } from 'h3'
import type { ResponseOutput, StatusMap } from '../../types'
import {
  checkResponse,
  checkRespondedStatus,
  checksResponses,
} from './response-check'

// The runtime key on the envelope below, and the whole of what makes a value
// the Respond helper's own: a plain object a handler wrote by hand carries no
// symbol, so it is refused rather than sent under a status nobody declared.
const RESPONDED = Symbol('nuxt-handler-validation:responded')

/** What `respond` hands back, and the only shape the wrapper unwraps. */
export interface RespondedEnvelope {
  readonly [RESPONDED]: true
  readonly status: number
  /** Absent for a status declared `null`, which sends no body at all. */
  readonly body?: unknown
}

/**
 * The Respond helper as the runtime knows it, before a declaration types it:
 * the wrapper casts the whole context it hands over, and the public
 * `Respond<Outputs>` is what a handler author sees at the call site.
 */
export type RespondFn = (
  status: number,
  ...body: readonly unknown[]
) => RespondedEnvelope

/**
 * The Respond helper every map-form route answers through: stateless and
 * shared, so the only per-response cost is the one envelope it returns.
 */
export const respond: RespondFn = (status, ...body) => {
  // Left off rather than set to `undefined`: a status declared `null` sends no
  // body at all, and `undefined` is not a value h3 can send.
  if (body.length === 0) return { [RESPONDED]: true, status }

  return { [RESPONDED]: true, status, body: body[0] }
}

/** The context slot a map-form route gets, spread in beside its sources. */
const RESPOND_SLOT = { respond }

/**
 * How a route answers, resolved once when the route file is evaluated: the
 * context slot the declaration earns, and the step that turns what the handler
 * handed over into what the client receives.
 */
export interface ResponseDelivery {
  /**
   * The Respond helper's slot, spread into the Validated context, or
   * `undefined` for a route the helper was never offered to - spreading
   * `undefined` is what lets both wrappers build their context unconditionally.
   */
  readonly respondSlot: { readonly respond: RespondFn } | undefined
  /**
   * Unwrap the handler's return and, in development, assert it against the
   * schema its status declared. Never a transform: what the handler handed
   * over is what goes out, in development exactly as in production.
   */
  send: (
    event: H3Event,
    returned: EventHandlerResponse
  ) => Promise<EventHandlerResponse>
}

// A route that declared no Response output: no helper, and the handler's own
// return passed straight through.
const UNDECLARED: ResponseDelivery = {
  respondSlot: undefined,
  send: async (_event, returned) => returned,
}

/**
 * Read a `output` declaration once, when the route file is evaluated, so a
 * route pays nothing per request for the form it did not declare. Both
 * wrappers resolve their declaration through here rather than each spelling
 * the form test, the context slot and the send step for themselves.
 *
 * Refuses, at declaration time, an `output` that names no reply the handler
 * could ever send: the compile guard's answer for a JavaScript caller.
 */
export function responseDelivery(
  output: ResponseOutput | undefined
): ResponseDelivery {
  if (output === undefined) return UNDECLARED

  if (declaresStatusMap(output)) {
    if (Object.keys(output).length === 0) raiseUndeclarableOutput(output)

    return {
      respondSlot: RESPOND_SLOT,
      send: (event, returned) => sendResponded(event, output, returned),
    }
  }

  if (!declaresSchema(output)) raiseUndeclarableOutput(output)

  return {
    respondSlot: undefined,
    send: async (event, returned) => {
      // The bare form is sugar for a single `200`, so that is the status the
      // declared schema answers for.
      if (checksResponses()) await checkResponse(event, 200, output, returned)

      return returned
    },
  }
}

/**
 * Whether a declared Response output is the map form. The bare form is a
 * Standard Schema, which is what the map is told apart from: a status map is a
 * plain object of statuses, never one carrying a `~standard` property.
 */
// `ResponseOutput | undefined` rather than `unknown`: both callers hold exactly
// that, and a parameter wider than every call site invites a fifth answer
// nobody wrote. The prototype test comes first, because `in` on a primitive
// throws - and it is also what turns away an array, a function and a `Map`,
// each of which is an object without ever having been a status map.
function declaresStatusMap(
  output: ResponseOutput | undefined
): output is StatusMap {
  if (output === undefined || output === null) return false

  const prototype: unknown = Object.getPrototypeOf(output)

  if (prototype !== Object.prototype && prototype !== null) return false

  return !('~standard' in output)
}

/**
 * The bare form: anything carrying the Standard Schema property. Told apart by
 * that property rather than by its prototype, because a hand-written Standard
 * Schema is a plain object too.
 */
function declaresSchema(
  output: ResponseOutput | undefined
): output is StandardSchemaV1 {
  return output instanceof Object && '~standard' in output
}

/**
 * Send what a map-form handler responded with: the declared status, and its
 * value as the body. A status declared `null` sends `null`, which is h3's own
 * spelling for "no body" and keeps the status the helper named.
 */
async function sendResponded(
  event: H3Event,
  statuses: StatusMap,
  returned: EventHandlerResponse
): Promise<EventHandlerResponse> {
  if (!isResponded(returned)) raiseUnrespondedReturn(returned)

  // Before the status is set, so a development server refuses an undeclared
  // status rather than sending it: the map has no schema at that status, and
  // the value check alone would find nothing to assert and let it through.
  if (checksResponses()) checkRespondedStatus(event, statuses, returned.status)

  setResponseStatus(event, returned.status)

  if (checksResponses()) {
    await checkResponse(
      event,
      returned.status,
      statuses[returned.status],
      returned.body
    )
  }

  return returned.body === undefined ? null : returned.body
}

function isResponded(
  returned: EventHandlerResponse
): returned is RespondedEnvelope {
  return returned instanceof Object && RESPONDED in returned
}

// The compile guard's answer for a caller the types never saw, shaped like
// every other developer mistake this package raises: a plain `500` with no
// marker, so an observability hook that skips validation failures reports it.
function raiseUnrespondedReturn(returned: EventHandlerResponse): never {
  throw createError({
    statusCode: 500,
    message:
      `[nuxt-handler-validation] cannot send the response: a route declaring a status map must return the Respond helper’s result, and ${describe(returned)} is not one. ` +
      `Return respond(status, value) - or respond(status) for a status declared null - from the handler.`,
  })
}

// A plain `Error` rather than a `500`: this fires at route evaluation, where
// there is no request to answer and the route never becomes servable.
function raiseUndeclarableOutput(output: ResponseOutput): never {
  throw new Error(
    `[nuxt-handler-validation] cannot declare the Response output: ${describe(output)} names no reply the handler could send. ` +
      `\`output\` holds a schema, for one 200 reply returned plainly, or a status map naming at least one status - drop the key instead of declaring it empty.`
  )
}

// The shapes an author is likely to have written, named as the author would
// name them: what they believed they had declared, or were sending.
function describe(value: EventHandlerResponse | ResponseOutput): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return 'an array'
  if (value !== Object(value)) return `the primitive ${String(value)}`

  const prototype: unknown = Object.getPrototypeOf(value)

  // A function's own prototype, and every class's, lands here; `Function` is
  // named on its own because "an instance of Function" reads as nothing.
  if (prototype === Function.prototype) return 'a function'

  if (prototype !== Object.prototype && prototype !== null) {
    return `an instance of ${value.constructor.name || 'an anonymous class'}`
  }

  return Object.keys(value).length === 0 ? 'an empty object' : 'a plain object'
}
