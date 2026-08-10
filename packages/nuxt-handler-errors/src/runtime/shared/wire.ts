/**
 * The wire protocol: the reserved key, the body it travels in, what the raise
 * site may hand `createError`, and the one place the marker is built. Alone in
 * a file because both directions depend on it and neither owns it.
 */

import type { KnownVariant } from '../types/known-error'

/**
 * The reserved key a known failure travels under, inside the error body's
 * `data`. Frozen wire protocol: its presence *is* the evidence the server
 * declared this failure, its value *is* the variant, and versioning is by key
 * rename. Deliberately does not track the package name.
 */
export const KNOWN_ERROR_KEY = '__knownError__'

export type KnownErrorKey = typeof KNOWN_ERROR_KEY

/** The marker as it sits inside `data`. */
export type KnownErrorMarker<E extends KnownVariant> = {
  [K in KnownErrorKey]: E
}

/**
 * Nitro's production error body with the marker inside `data` — the only
 * extension point across both hops. ofetch's `FetchError.data` is the whole
 * response body, so a fetched carrier holds the variant at
 * `err.data.data.__knownError__`.
 */
export interface KnownErrorBody<E extends KnownVariant> {
  error: true
  url: string
  statusCode: number
  statusMessage: string
  message: string
  data: KnownErrorMarker<E>
}

/**
 * What the raise is allowed to hand `createError`. `statusMessage?: never` is
 * a standing constraint made structural: an escaped server-to-server throw
 * forwards the reason phrase untouched even while everything else is scrubbed,
 * so the tag must never ride it — writing `statusMessage: tag` is exactly how
 * the old package leaked. `message` MAY carry the tag: the production handler
 * scrubs it on any escape, so it only ever reaches the route's own client,
 * which knows the tag already.
 */
export interface KnownRaiseInput<E extends KnownVariant> {
  statusCode: number
  message: string
  data: KnownErrorMarker<E>
  statusMessage?: never
}

/**
 * Build the marker for one raised failure. The reserved names are spread
 * **last** so a payload field cannot displace the floor, and the marker's
 * `status` copy is authoritative (h3 rewrites an out-of-range HTTP status).
 */
export function knownErrorMarker(
  tag: string,
  status: number,
  fields: Record<string, unknown>
): KnownErrorMarker<KnownVariant> {
  return { [KNOWN_ERROR_KEY]: { ...fields, tag, status } }
}
