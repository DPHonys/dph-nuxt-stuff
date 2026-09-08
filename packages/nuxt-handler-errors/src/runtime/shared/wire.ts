import { z } from 'zod'
import type { KnownVariant } from '../types/known-error'
import type { PlainObject } from './plain-object'

/**
 * The reserved key a known failure travels under, inside the error body's
 * `data`. Frozen wire protocol - versioning is by key rename.
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

/** The raise site's own throw: the marker sits directly in `data`. */
export interface RaisedKnownError<E extends KnownVariant> {
  data: KnownErrorMarker<E>
}

/** A fetched carrier: the marker sits in the body, one level down. */
export interface FetchedKnownError<E extends KnownVariant> {
  data: KnownErrorBody<E>
}

/** An error carrying a well-formed marker at either wire depth. */
export type MarkedError<E extends KnownVariant> =
  | RaisedKnownError<E>
  | FetchedKnownError<E>

// `statusMessage?: never` made structural: an escaped server-to-server throw
// forwards the reason phrase untouched, so the tag must never ride it.
// `message` MAY carry the tag - the production handler scrubs it on escape.
export interface KnownRaiseInput<E extends KnownVariant> {
  statusCode: number
  message: string
  data: KnownErrorMarker<E>
  statusMessage?: never
}

// Presence is not enough: `tag` and `status` are verified, so a
// present-but-malformed marker reads as unknown. Loose, because the payload
// fields ride beside the two reserved names.
export const variantSchema = z.looseObject({
  tag: z.string(),
  status: z.number(),
})

// `data` at the depth that holds the marker. Loose at every level: the
// payload fields ride beside the reserved names, and a serialized body keeps
// a consumer's own sibling keys and dev's `stack`.
const markerHostSchema = z.looseObject({ [KNOWN_ERROR_KEY]: variantSchema })

// The raise-site depth first: a well-formed marker there wins over a nested
// one, which is the order the recognizer has always read them in.
const markedErrorSchema = z.looseObject({
  data: z.union([markerHostSchema, z.looseObject({ data: markerHostSchema })]),
})

/**
 * Whether an error carries a well-formed marker at either depth. The one
 * boundary parse of the wire; everything typed downstream reads through it.
 */
export function isMarkedError(
  error: unknown
): error is MarkedError<KnownVariant> {
  return markedErrorSchema.safeParse(error).success
}

/**
 * The raise-site depth, told apart from a carrier body by the schema rather
 * than by key presence: a body is loose, and a consumer's own sibling keys
 * may include `data`.
 */
export function isRaisedData(
  data: MarkedError<KnownVariant>['data']
): data is KnownErrorMarker<KnownVariant> {
  return markerHostSchema.safeParse(data).success
}

/** The variant a marked error carries - the raise-site depth first. */
export function markerOf(error: MarkedError<KnownVariant>): KnownVariant {
  const { data } = error

  return isRaisedData(data) ? data[KNOWN_ERROR_KEY] : data.data[KNOWN_ERROR_KEY]
}

// Reserved names spread LAST so a payload field cannot displace the floor;
// the marker's `status` copy is authoritative (h3 rewrites an out-of-range
// HTTP status).
export function knownErrorMarker(
  tag: string,
  status: number,
  fields: PlainObject
): KnownErrorMarker<KnownVariant> {
  return { [KNOWN_ERROR_KEY]: { ...fields, tag, status } }
}
