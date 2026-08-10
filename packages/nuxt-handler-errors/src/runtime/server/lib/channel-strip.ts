// Channel gating, the response half: prepended to Nitro's error-handler
// chain, answers a tokenless request whose error carries the marker with the
// builtin's own body, marker removed. The thrown error is never touched —
// `captureError` fires the `error` hook before the chain runs, so
// observability sees the marker on every known failure regardless of caller.

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

// Strips the marker at either depth the wire uses — `data.<marker>` for the
// route's own raise, `data.data.<marker>` for a rethrown fetched carrier.
// Built by spread throughout so the thrown error's own `data` object is left
// untouched. A `data` left with no other key is dropped rather than sent as
// `{}` — `undefined` is the shape the builtin itself sends.
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
 * without the token".
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

    // A non-object body is the dev builtin's youch HTML page — nothing to strip.
    if (typeof res.body !== 'object' || res.body === null) return

    const body = { ...res.body, data: withoutMarker(res.body.data) }

    // The builtin's own send, verbatim, so a stripped response differs from
    // an unstripped one in the marker and nothing else.
    if (!event.node?.res.headersSent) setResponseHeaders(event, res.headers)

    setResponseStatus(event, res.status, res.statusText)

    await send(event, JSON.stringify(body, null, 2))
  }
}
