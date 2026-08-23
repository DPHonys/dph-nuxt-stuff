import type { H3Event, HTTPMethod } from 'h3'
import { getQuery, getRequestHeaders, getRouterParams, readBody } from 'h3'
import type { ValidationSource } from '../../types'
import type { OnInvalid } from './issues'

/**
 * How one source is taken off the event. A read that already knows the input
 * is bad reports through `onInvalid`, the same door a rejecting schema uses.
 */
export type SourceReader = (event: H3Event, onInvalid: OnInvalid) => unknown

// Exactly h3 v1's `PayloadMethods`, copied because h3 does not export it. A
// method h3 refuses but this file would read gets `assertMethod`'s bare `405`.
const PAYLOAD_METHODS: ReadonlySet<HTTPMethod> = new Set([
  'PATCH',
  'POST',
  'PUT',
  'DELETE',
])

// Owned here rather than borrowed from h3 ("Invalid JSON body"), so an h3 patch
// is not a change to this package's wire contract.
const UNPARSEABLE_BODY_MESSAGE = 'Request body could not be parsed'

// By status and never by message, so no foreign 4xx - even one h3 grows later -
// escapes the body read with a shape a client would have to detect differently.
function isClientError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) {
    return false
  }

  const { statusCode } = error

  return typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500
}

/**
 * Reads the body once, through h3's own validated-body door. `{ strict: true }`
 * is what `readValidatedBody` itself passes: without it, h3's
 * `contentType === 'application/json'` exact-equality test sends a charset'd
 * header down the non-strict branch, where a malformed payload comes back as a
 * raw string instead of failing. h3 memoizes the parse, so a middleware that
 * read the body first has already cached a non-strict one.
 */
async function readBodyForValidation(
  event: H3Event,
  onInvalid: OnInvalid
): Promise<unknown> {
  // Skipped, never attempted-and-caught, so a method-agnostic route file still
  // works for `GET`. The accepted cost: a real mis-declaration
  // (`users.get.ts` declaring a body) answers `400` instead of `500`.
  if (!PAYLOAD_METHODS.has(event.method)) return undefined

  try {
    return await readBody(event, { strict: true })
  } catch (error) {
    // 5xx and non-HTTP throws - a dropped connection, a stream error - are not
    // the client sending something wrong, so they propagate untouched.
    if (!isClientError(error)) throw error

    // Raised rather than returned, because there is nothing to validate: one
    // issue, already in the projected shape, exactly like a rejecting schema.
    onInvalid('body', [
      { source: 'body', message: UNPARSEABLE_BODY_MESSAGE, path: [] },
    ])
  }
}

// Every source exactly once, paired with its reader. The annotation is
// load-bearing: a source left out of the walk would type-check everywhere and
// then silently never validate, so omitting one fails to compile here instead.
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
 * The four sources in the order they validate - the promise that a bad route
 * param means the body is never read. Each reaches its schema exactly as h3
 * yields it: route params decoded and a catch-all slash-joined under one key,
 * query values as `string | string[]`, header keys lowercased.
 */
export const SOURCE_WALK: SourceWalk = [
  ['routerParams', (event) => getRouterParams(event, { decode: true })],
  ['query', (event) => getQuery(event)],
  ['headers', (event) => getRequestHeaders(event)],
  ['body', readBodyForValidation],
]
