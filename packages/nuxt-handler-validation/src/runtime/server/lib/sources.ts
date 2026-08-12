import type { H3Event, HTTPMethod } from 'h3'
import { getQuery, getRequestHeaders, getRouterParams, readBody } from 'h3'
import type { ValidationSource } from '../../types/schemas'
import { raiseValidationError } from './issues'

/** How one source is taken off the event. */
type SourceReader = (event: H3Event) => unknown

/**
 * Exactly h3 v1's `PayloadMethods` - the set `readRawBody` asserts against.
 *
 * It is copied rather than imported because h3 does not export it, and it must
 * stay *exactly* h3's set: a method h3 refuses but this file would read gets
 * `assertMethod`'s bare `405 "HTTP method is not allowed."`, which is a red
 * herring on a request whose only real problem is that it carries no body.
 */
const PAYLOAD_METHODS: ReadonlySet<HTTPMethod> = new Set([
  'PATCH',
  'POST',
  'PUT',
  'DELETE',
])

/**
 * The one thing this package says about a body it could not read. It is owned
 * here rather than borrowed from h3 ("Invalid JSON body"): h3's wording would
 * lie to a `multipart/form-data` upload, and adopting it would make an h3
 * patch a change to this package's wire contract. It never echoes body content
 * and is identical in dev and prod.
 */
const UNPARSEABLE_BODY_MESSAGE = 'Request body could not be parsed'

/**
 * Whether a thrown value blames the client, read from its status alone.
 *
 * By status and never by message, so no foreign 4xx can escape the body read
 * with a shape a client would have to detect differently - even one h3 grows
 * later. Anything with no HTTP status is not the client's fault.
 */
function isClientError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) {
    return false
  }

  const { statusCode } = error

  return typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500
}

/**
 * Reads the body once, through h3's own validated-body door.
 *
 * Three things the plain `readBody(event)` this replaced got wrong, each a
 * claim about h3 v1 rather than a preference:
 *
 * - **`{ strict: true }`** is what `readValidatedBody` itself passes. Without
 *   it, h3's `contentType === 'application/json'` exact-equality test sends a
 *   charset'd header down the non-strict branch, where a malformed payload
 *   comes back as a raw string instead of failing. Under this door
 *   `application/x-www-form-urlencoded` still arrives as an object of
 *   `string | string[]` and `text/*` still arrives as the raw string, while
 *   every other and absent content type parses strictly - h3 v1's table,
 *   described here and deliberately not promised, since h3 v2 keeps none of it.
 * - **The skip**, not a catch: outside h3's payload methods the read is never
 *   taken, so `assertMethod`'s bare `405` cannot be reached and the body
 *   validates `undefined` exactly as an empty one does.
 * - **The catch net**, for what the read still throws. See the wrapper's own
 *   docs for what a caller is promised.
 *
 * The read is taken once because h3 memoizes its parse - in both directions. A
 * later `readBody` in a handler body gets the cached **unvalidated** value, not
 * a second pass over the stream; and a middleware that read the body first has
 * already cached a **non-strictly** parsed one, so `strict: true` is never
 * consulted. That second case is accepted rather than closed: every promised
 * invariant survives and only the message drifts from ours to the schema's.
 */
async function readBodyForValidation(event: H3Event): Promise<unknown> {
  // Skipped, never attempted-and-caught: this is what keeps a method-agnostic
  // route file (`server/api/users.ts`, where no filename names a method)
  // working for `GET`. The knowingly accepted cost is that a real
  // mis-declaration (`users.get.ts` declaring a body) is indistinguishable from
  // that pattern, so it answers `400` blaming the client instead of `500`.
  if (!PAYLOAD_METHODS.has(event.method)) return undefined

  try {
    return await readBody(event, { strict: true })
  } catch (error) {
    // 5xx and non-HTTP throws - a dropped connection, a stream error - are not
    // the client sending something wrong, so they propagate untouched rather
    // than being dressed up as validation issues.
    if (!isClientError(error)) throw error

    // Raised here rather than returned, because there is nothing to validate:
    // one issue, this package's own shape, exactly like a rejecting schema.
    raiseValidationError('body', [{ message: UNPARSEABLE_BODY_MESSAGE }])
  }
}

/**
 * Every source exactly once, paired with its reader: a permutation type over
 * `ValidationSource`.
 *
 * The annotation is load-bearing, not decoration. A source left out of the walk
 * would type-check everywhere and then silently never validate - the precise
 * bug this walk exists to prevent - so omitting one, naming one twice, or
 * adding a fifth source to `ValidateSchemas` without walking it all fail to
 * compile. `satisfies readonly ValidationSource[]` would prove only that each
 * entry *is* a source, never that all of them are here.
 */
type SourceWalk<Remaining extends ValidationSource = ValidationSource> = [
  Remaining,
] extends [never]
  ? readonly []
  : {
      [S in Remaining]: readonly [
        readonly [source: S, read: SourceReader],
        ...SourceWalk<Exclude<Remaining, S>>,
      ]
    }[Remaining]

/**
 * The four sources in the order they validate:
 * `routerParams -> query -> headers -> body`. Cheap-and-sync first,
 * stream-consuming last, so a failure in an earlier source spares the body
 * parse entirely.
 *
 * This array order is the promise. It is what makes "a bad route param means
 * the body is never read" something a caller can rely on, and it matches h3
 * v2's `defineValidatedHandler`, so the eventual alignment stays a rename.
 *
 * Each source is handed to its schema exactly as h3 yields it - nothing is
 * normalized, coerced or re-shaped on the way, because every conversion belongs
 * in the user's schema where all their other parsing rules live:
 *
 * - **routerParams** arrive decoded (h3's `decode: true`), so a schema sees
 *   what the user meant rather than percent-escapes. A catch-all segment
 *   arrives as one slash-joined string under the route's own key (`_` when the
 *   catch-all is anonymous) - h3's matcher decides that, not this package.
 * - **query** values are `string | string[]`; a repeated key becomes an array.
 * - **headers** have lowercase keys and multi-values joined with `", "`. No
 *   case-insensitivity and no splitting is added.
 * - **body** is h3's parse of the request payload, taken through the door
 *   described on `readBodyForValidation` - the one source whose reading has rules
 *   of its own.
 */
export const SOURCE_WALK: SourceWalk = [
  ['routerParams', (event) => getRouterParams(event, { decode: true })],
  ['query', (event) => getQuery(event)],
  ['headers', (event) => getRequestHeaders(event)],
  ['body', readBodyForValidation],
]
