/**
 * Channel gating, the response half: the entry this module prepends to Nitro's
 * error-handler chain, which answers a **tokenless** request whose error
 * carries the marker with the builtin's own body, marker removed.
 *
 * The seam is measured (DESIGN §3). `nitro.options.errorHandler` accepts an
 * array; the virtual `#nitro-internal-virtual/error-handler` runs the entries in
 * order, stops at the first that leaves `event.handled`, and appends the builtin
 * prod/dev handler **last** — so a prepended entry either answers a request or
 * returns and lets the chain continue exactly as if it were not there.
 * `defaultHandler` *returns* `{ status, statusText, headers, body }` without
 * sending, which is what makes rendering a modified body possible without
 * owning the serializer.
 *
 * **The thrown error is never touched.** Only the body this function sends is
 * built without the marker — the Sentry-stability requirement: `captureError`
 * fires the `error` hook *before* the chain runs, so observability sees the
 * marker on every known failure regardless of who called.
 *
 * A factory over a token reader rather than a value: the runtime config lives
 * behind `nitropack/runtime`, and keeping that import in the thin wiring file
 * next door is what lets this logic be tested with nothing booted.
 */

import type { H3Error, H3Event } from 'h3'
import {
  getRequestHeader,
  send,
  setResponseHeaders,
  setResponseStatus,
} from 'h3'
import type { NitroErrorHandler } from 'nitropack/types'
import { CHANNEL_HEADER } from '../../shared/channel'
import { readFloor } from '../../shared/match-error'
import { KNOWN_ERROR_KEY } from '../../shared/wire'

/**
 * The serialized `data` with the marker gone, at either depth the wire uses —
 * `data.<marker>` for the route's own raise, `data.data.<marker>` for a
 * rethrown fetched carrier whose outer `data` is the callee's whole body.
 *
 * Built by spread throughout, so the thrown error's own `data` object — which
 * this shares by reference, because Nitro's serializer passes `error.data`
 * straight through — is left exactly as the raise site made it.
 *
 * A `data` left with no other key is dropped entirely rather than sent as `{}`:
 * the payload fields ride *inside* the marker, so that is the ordinary case,
 * and `undefined` is the shape the builtin itself sends when it withholds data.
 */
function withoutMarker(data: unknown): unknown {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return data
  }

  const record = data as Record<string, unknown>

  if (KNOWN_ERROR_KEY in record) {
    const { [KNOWN_ERROR_KEY]: _marker, ...rest } = record

    return Object.keys(rest).length > 0 ? rest : undefined
  }

  return 'data' in record
    ? { ...record, data: withoutMarker(record.data) }
    : record
}

/**
 * The chain entry. Returns — deferring to whatever comes next, ultimately the
 * builtin — for every case that is not "a marked error answering a caller
 * without the token":
 *
 * - no token configured: gating is off, and this module is inert
 * - no marker on the error: a foreign error, never this module's business
 * - the request carries the token: the app's own call, which gets the full wire
 * - a non-object body: the dev builtin's youch HTML page, which has no `data`
 *   field to strip and is a developer's own browser by construction
 *
 * The dev builtin's JSON body carries `stack`; spreading `res.body` forwards it
 * unchanged, which is exactly what the dev builtin would have sent — dev
 * behaviour is not altered here beyond the marker itself.
 */
export function createChannelStripHandler(
  getToken: (event: H3Event) => string | undefined
): NitroErrorHandler {
  return async (error: H3Error, event: H3Event, { defaultHandler }) => {
    const token = getToken(event)

    if (token === undefined) return
    if (readFloor(error) === undefined) return
    if (getRequestHeader(event, CHANNEL_HEADER) === token) return

    const res = await defaultHandler(error, event)

    if (typeof res.body !== 'object' || res.body === null) return

    const body = { ...res.body, data: withoutMarker(res.body.data) }

    // The builtin's own send, verbatim (dev's headersSent guard included, which
    // is harmless in prod), so a stripped response differs from an unstripped
    // one in the marker and nothing else.
    if (!event.node?.res.headersSent) setResponseHeaders(event, res.headers)

    setResponseStatus(event, res.status, res.statusText)

    await send(event, JSON.stringify(body, null, 2))
  }
}
