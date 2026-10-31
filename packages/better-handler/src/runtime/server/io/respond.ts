/**
 * The io half's response side: a route's `output` resolved once into a
 * delivery when the route module is evaluated, and run on whatever the
 * Handler hands back. Beside the source readers, the one file importing an h3
 * runtime helper outside the h3 seam: `setResponseStatus`, which on h3 v2 is
 * a write to `event.res.status` instead.
 */

import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { EventHandlerResponse, H3Event } from 'h3'
import { setResponseStatus } from 'h3'
import {
  isPlainObject,
  isRecordLike,
  isStandardSchema,
} from '../../shared/guards'
import type { ResponseOutput, StatusMap } from '../../types/io/output'
import { devChecksEnabled } from '../dev-checks'
import {
  declarationFault,
  describeRoute,
  describeValue,
  developerFault,
} from '../faults'
import { checkRespondedStatus, checkResponse } from './response-check'

// The runtime key on the envelope below, and the whole of what makes a value
// the Respond helper's own: a plain object a Handler wrote by hand carries no
// symbol, so it is refused rather than sent under a status nobody declared.
const RESPONDED = Symbol('better-handler:responded')

/** What `respond` hands back, and the only shape a map-form route unwraps. */
interface RespondedEnvelope {
  readonly [RESPONDED]: true
  readonly status: number
  /** Absent when the call passed none, as a status declared `null` takes. */
  readonly body?: EventHandlerResponse
}

/**
 * The Respond helper as the runtime knows it, before a declaration types it:
 * the wrapper casts the whole context it hands over, and the public
 * `Respond<Outputs>` is what an author sees at the call site.
 */
export type RespondFn = (
  status: number,
  ...body: readonly EventHandlerResponse[]
) => RespondedEnvelope

/**
 * The Respond helper every map-form route answers through: stateless and
 * shared, so the only per-response cost is the one envelope it returns.
 */
const respond: RespondFn = (status, ...body) => {
  // Left off rather than set to `undefined`: a status declared `null` sends no
  // body at all, and `undefined` is not a value h3 can send.
  if (body.length === 0) return { [RESPONDED]: true, status }

  return { [RESPONDED]: true, status, body: body[0] }
}

/**
 * How a route answers, resolved once when the route module is evaluated: the
 * Respond helper the declaration earns, and the step that turns what the
 * Handler handed over into what the client receives.
 */
export interface ResponseDelivery {
  /** Whether `output` declares a reply: a schema, or a map naming a status. */
  readonly declared: boolean
  /** The Respond helper, for a status map only. */
  readonly respond: RespondFn | undefined
  /**
   * Unwrap the Handler's return and, with the `devChecks` flag on, assert it
   * against the schema its status declares. Never a transform: what the
   * Handler handed over is what goes out, in development as in production.
   */
  readonly send: <Returned>(
    event: H3Event,
    returned: Returned
  ) => Promise<EventHandlerResponse>
}

// A route declaring no Response output: no helper, and the Handler's own
// return passed straight through.
const UNDECLARED: ResponseDelivery = {
  declared: false,
  respond: undefined,
  send: async (_event, returned) => returned,
}

/**
 * The map form: a plain object of statuses, never one carrying the Standard
 * Schema property, which is how a hand-written schema is told apart from it.
 * A null prototype passes, as for every other map the package reads.
 */
function isStatusMap<Output>(output: Output): output is Output & StatusMap {
  return isPlainObject(output) && !('~standard' in output)
}

// A success status as an object key spells it: an integer from 100 to 399,
// in its plain decimal form. A failure status is no reply of `output`'s: a
// client fetch throws on 400 and above, so its body would never arrive as
// data, and it is declared under `errors` instead, as a Known error.
const STATUS_KEY = /^[1-3]\d{2}$/

/**
 * Each key checked to be a status from 100 to 399, and each status's slot a
 * Standard Schema or `null` for no body. A key h3 cannot send as a status
 * would otherwise leave the current status in place under a reply declared
 * for another.
 */
function checkStatusMap(statuses: StatusMap): void {
  for (const [status, slot] of Object.entries(statuses)) {
    if (!STATUS_KEY.test(status)) {
      throw declarationFault(
        `The output's key "${status}" must be a status, an integer from 100 to 399 - a failure status is declared under errors, by tag.`
      )
    }

    if (slot === null || isStandardSchema(slot)) continue

    throw declarationFault(
      `The output for status ${status} must be a Standard Schema, or null for a reply with no body, not ${describeValue(slot)}.`
    )
  }
}

/**
 * Resolve a route's `output` once, when the route module is evaluated, so a
 * route pays nothing per request for the form it did not declare. Refuses, as
 * a declaration fault, an `output` that is neither form, a key that is no
 * status from 100 to 399, and a status whose slot is neither a schema nor
 * `null`: the compile guard's answer for a caller the types never saw. A map
 * naming no status declares nothing, as an empty `input` or `errors` does.
 */
export function responseDelivery(
  output: ResponseOutput | undefined
): ResponseDelivery {
  if (output === undefined) return UNDECLARED

  if (isStandardSchema(output)) return bareDelivery(output)

  if (!isStatusMap(output)) {
    throw declarationFault(
      `The output of defineBetterEventHandler must be a Standard Schema, for one 200 reply returned plainly, or a map from status to schema, not ${describeValue(output)}.`
    )
  }

  if (Object.keys(output).length === 0) return UNDECLARED

  checkStatusMap(output)

  return {
    declared: true,
    respond,
    send: async (event, returned) => sendResponded(event, output, returned),
  }
}

/** The bare form: one `200` reply, returned plainly. */
function bareDelivery(schema: StandardSchemaV1): ResponseDelivery {
  return {
    declared: true,
    respond: undefined,
    send: async (event, returned) => {
      // The bare form is sugar for a single `200`, so that is the status the
      // declared schema answers for - set, as the map form sets its status,
      // and before the check, so a status a Handler or a middleware changed
      // cannot carry the 200 body.
      setResponseStatus(event, 200)

      if (devChecksEnabled()) await checkResponse(event, 200, schema, returned)

      return returned
    },
  }
}

function isResponded<Returned>(
  returned: Returned
): returned is Returned & RespondedEnvelope {
  return isRecordLike(returned) && RESPONDED in returned
}

/**
 * Send what a map-form Handler responded with: the declared status, and its
 * value as the body. A status declared `null` sends `null`, h3's own spelling
 * for "no body", whatever a caller the types never saw passed beside it.
 */
async function sendResponded<Returned>(
  event: H3Event,
  statuses: StatusMap,
  returned: Returned
): Promise<EventHandlerResponse> {
  // The compile guard's answer for a caller the types never saw, checked in
  // production too: a bare value names no status to send it under.
  if (!isResponded(returned)) {
    throw developerFault(
      `cannot send the response: ${describeRoute(event)} declares a status map, so it must return the Respond helper's result, and ${describeValue(returned)} is not one. ` +
        'Return respond(status, value) - or respond(status) for a status declared null - from the Handler.'
    )
  }

  const { status, body } = returned

  // Before the status is set, so a development server refuses an undeclared
  // status rather than sending it: the map has no schema there, and the value
  // check alone would find nothing to assert and let it through.
  if (devChecksEnabled()) checkRespondedStatus(event, statuses, status)

  setResponseStatus(event, status)

  if (devChecksEnabled()) {
    await checkResponse(event, status, statuses[status], body)
  }

  // The declaration decides, not the envelope: the runtime helper takes any
  // arguments, so a plain-JavaScript `respond(204, value)` carries a body the
  // declared `null` promised never to send.
  if (statuses[status] === null || body === undefined) return null

  return body
}
