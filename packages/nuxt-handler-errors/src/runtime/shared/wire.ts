import type { KnownVariant } from '../types/known-error'

/**
 * The reserved key a known failure travels under, inside the error body's
 * `data`. Frozen wire protocol — versioning is by key rename.
 */
export const KNOWN_ERROR_KEY = '__knownError__'

export type KnownErrorKey = typeof KNOWN_ERROR_KEY

/** The marker as it sits inside `data`. */
export type KnownErrorMarker<E extends KnownVariant> = {
  [K in KnownErrorKey]: E
}

/**
 * Nitro's production error body with the marker inside `data`. ofetch's
 * `FetchError.data` is the whole response body, so a fetched carrier holds
 * the variant at `err.data.data.__knownError__`.
 */
export interface KnownErrorBody<E extends KnownVariant> {
  error: true
  url: string
  statusCode: number
  statusMessage: string
  message: string
  data: KnownErrorMarker<E>
}

// `statusMessage?: never` made structural: an escaped server-to-server throw
// forwards the reason phrase untouched, so the tag must never ride it.
// `message` MAY carry the tag — the production handler scrubs it on escape.
export interface KnownRaiseInput<E extends KnownVariant> {
  statusCode: number
  message: string
  data: KnownErrorMarker<E>
  statusMessage?: never
}

// Reserved names spread LAST so a payload field cannot displace the floor;
// the marker's `status` copy is authoritative (h3 rewrites an out-of-range
// HTTP status).
export function knownErrorMarker(
  tag: string,
  status: number,
  fields: Record<string, unknown>
): KnownErrorMarker<KnownVariant> {
  return { [KNOWN_ERROR_KEY]: { ...fields, tag, status } }
}
