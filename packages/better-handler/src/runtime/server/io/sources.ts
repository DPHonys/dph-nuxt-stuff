/**
 * The source readers: how each Validation source is taken off the event,
 * exactly as h3 yields it. Beside the h3 seam, the one file that reads a
 * request through h3 v1's own helpers; on h3 v2 only the readers change.
 */

import type { H3Event, HTTPMethod, RequestHeaders } from 'h3'
import { getQuery, getRequestHeaders, getRouterParams, readBody } from 'h3'
import { isNormalisedError } from '../../shared/h3'
import { VALIDATION_SOURCES } from '../../shared/io/sources'
import type { ValidationSource } from '../../types/io/input'
import type { OnInvalid } from './issues'

/**
 * A JSON document, which is all h3's strict body read can hand back: `destr`
 * over the raw bytes, a `text/*` body as the string it is, or a form post as
 * an object of strings.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

/** The body as read: `undefined` when the request carried none. */
type RequestBody = JsonValue | undefined

/**
 * What each source is, exactly as h3 yields it to the schemas: route params
 * decoded and a catch-all slash-joined under one key, query values as
 * `string | string[]`, header keys lowercased, the body as `readBody` parsed
 * it.
 */
interface RawSources {
  route: ReturnType<typeof getRouterParams>
  query: ReturnType<typeof getQuery>
  headers: RequestHeaders
  body: RequestBody
}

/** The raw value of any one source: what a schema's `validate` receives. */
export type RawSource = RawSources[ValidationSource]

/**
 * How one source is taken off the event. A read that already knows the input
 * is bad reports through `onInvalid`, the door a rejecting schema uses.
 */
export type SourceReader<Source extends ValidationSource = ValidationSource> = (
  event: H3Event,
  onInvalid: OnInvalid
) => RawSources[Source] | Promise<RawSources[Source]>

// Exactly h3 v1's `PayloadMethods`, copied because h3 does not export it. A
// method h3 refuses but this file would read gets `assertMethod`'s bare `405`.
const PAYLOAD_METHODS: ReadonlySet<HTTPMethod> = new Set([
  'PATCH',
  'POST',
  'PUT',
  'DELETE',
])

// Owned here rather than borrowed from h3 ("Invalid JSON body"), so an h3
// patch is not a change to this package's wire contract.
const UNPARSEABLE_BODY_MESSAGE = 'Request body could not be parsed'

/**
 * Read the body once, through h3's own validated-body door. `{ strict: true }`
 * is what `readValidatedBody` itself passes: without it, h3's
 * `contentType === 'application/json'` exact-equality test sends a charset'd
 * header down the non-strict branch, where a malformed payload comes back as a
 * raw string instead of failing. h3 memoizes the parse, so a middleware that
 * read the body first has already cached a non-strict one.
 */
async function readBodyForValidation(
  event: H3Event,
  onInvalid: OnInvalid
): Promise<RequestBody> {
  // Skipped, never attempted and caught, so a method-agnostic route file
  // still serves `GET`. The accepted cost: a real misdeclaration
  // (`users.get.ts` declaring a body) answers `400` rather than `500`.
  if (!PAYLOAD_METHODS.has(event.method)) return undefined

  try {
    return await readBody<RequestBody>(event, { strict: true })
  } catch (error) {
    // Only h3's own 4xx is the client sending something wrong, judged by
    // status and never by message, so no h3 4xx - even one it grows later -
    // escapes with a shape a client would have to detect differently. A 5xx
    // and a non-HTTP throw (a dropped connection, a stream error) propagate
    // untouched.
    if (
      !isNormalisedError(error) ||
      error.statusCode < 400 ||
      error.statusCode >= 500
    ) {
      throw error
    }

    // Raised rather than returned, because there is nothing to validate: one
    // issue, already projected, exactly as a rejecting schema reports.
    return onInvalid('body', [
      { source: 'body', message: UNPARSEABLE_BODY_MESSAGE, path: [] },
    ])
  }
}

/**
 * One reader per source, keyed so a source left out fails to compile here
 * instead of type-checking everywhere and then silently never validating.
 */
type SourceReaders = {
  readonly [Source in ValidationSource]: SourceReader<Source>
}

const SOURCE_READERS: SourceReaders = {
  route: (event) => getRouterParams(event, { decode: true }),
  query: (event) => getQuery(event),
  headers: (event) => getRequestHeaders(event),
  body: readBodyForValidation,
}

/**
 * Every source paired with its reader, in `VALIDATION_SOURCES` order: the
 * walk that makes the fail-fast order the package's promise rather than the
 * declaration's key order.
 */
export const SOURCE_WALK: ReadonlyArray<
  readonly [source: ValidationSource, read: SourceReader]
> = VALIDATION_SOURCES.map((source) => [source, SOURCE_READERS[source]])
