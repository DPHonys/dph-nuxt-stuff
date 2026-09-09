import type { EventHandlerResponse, H3Event } from 'h3'
import { createError, setResponseStatus } from 'h3'
import type { ResponseOutputMap } from '../../types'

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
export const RESPOND_SLOT = { respond }

/**
 * Whether a declared Response output is the map form. The bare form is a
 * Standard Schema, which is what the map is told apart from: a status map
 * carries statuses, never a `~standard` property.
 */
export function declaresStatusMap(
  output: unknown
): output is ResponseOutputMap {
  return output instanceof Object && !('~standard' in output)
}

/**
 * Send what a map-form handler responded with: the declared status, and its
 * value as the body. A status declared `null` sends `null`, which is h3's own
 * spelling for "no body" and keeps the status the helper named.
 */
export function sendResponded(
  event: H3Event,
  returned: EventHandlerResponse
): EventHandlerResponse {
  if (!isResponded(returned)) raiseUnrespondedReturn(returned)

  setResponseStatus(event, returned.status)

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

// The shapes an author is likely to have returned, named as the author would
// name them: what they believed they were sending.
function describe(returned: EventHandlerResponse): string {
  if (returned === null) return 'null'
  if (returned === undefined) return 'undefined'
  if (Array.isArray(returned)) return 'an array'
  if (returned instanceof Object) return 'a plain object'

  return `the primitive ${String(returned)}`
}
