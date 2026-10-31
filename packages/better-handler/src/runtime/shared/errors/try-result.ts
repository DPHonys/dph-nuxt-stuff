import type { NuxtError } from 'nuxt/app'
import type { RequestFailed, TryResult } from '../../types/errors/client'
import type { TaggedError } from '../../types/errors/tagged'
import { isNumber, isRecordLike } from '../guards'
import { isNormalisedError, toNuxtError } from '../h3'
import { taggedOf } from './tagged'

// The body a fetched error carries as its `data`, and the Tagged error inside
// it: a fetched failure's `data` is the whole Nitro error body, so a Known
// error sits one level further down than where the route raised it.
function fetchedTagged(error: NuxtError): TaggedError | undefined {
  const body = error.data

  return isRecordLike(body) && 'data' in body ? taggedOf(body.data) : undefined
}

// The status a response carried, read off ofetch's error, which reads
// `statusCode` and `status` off the response and answers `undefined` when
// none arrived.
function responseStatusOf(cause: unknown): number | undefined {
  if (!isRecordLike(cause)) return undefined
  if ('statusCode' in cause && isNumber(cause.statusCode)) {
    return cause.statusCode
  }
  if ('status' in cause && isNumber(cause.status)) return cause.status

  return undefined
}

// The status of the response a failure came with, never h3's normalisation of
// it, which answers `500` for a request that never got one. An error h3
// already normalised - a `useFetch` error ref - keeps what it normalised as
// its own `cause`: ofetch's error when a response arrived, the network or
// abort error when none did. Without one, its own status is all there is.
function statusOf(cause: unknown): number | undefined {
  if (isNormalisedError(cause) && isRecordLike(cause.cause)) {
    return responseStatusOf(cause.cause)
  }

  return responseStatusOf(cause)
}

// Where each classified variant came from, keyed by the variant itself. Kept
// on the realm's `globalThis` under a registered symbol rather than in this
// module: during server-side rendering the `.try` that classifies a failure
// runs in Nitro's copy of this file (the global and `event.$betterFetch` are
// installed by a Nitro plugin) while `useBetterAsyncData` reads the origin
// back in the app bundle's copy. A `WeakMap` rather than a property on the
// variant: the variant is the caller's value, and Nuxt's payload serializer
// refuses an object carrying a symbol key.
const FAILURE_ORIGINS = Symbol.for('@dphonys/better-handler/failure-origins')

interface FailureOriginsHost {
  [FAILURE_ORIGINS]?: WeakMap<TaggedError, NuxtError>
}

function failureOrigins(): WeakMap<TaggedError, NuxtError> {
  // SAFETY: `globalThis` is an ordinary extensible object, and the one key
  // read and written here is this package's registered symbol, which holds
  // nothing but the map below.
  const host = globalThis as FailureOriginsHost

  host[FAILURE_ORIGINS] ??= new WeakMap()

  return host[FAILURE_ORIGINS]
}

/**
 * The `NuxtError` a classified variant was read off, or `undefined` for a
 * variant the fetch family did not classify, such as a copy of one. What
 * `useBetterAsyncData` rethrows, so the `error` ref is the error the fetch
 * threw, its body and status intact, rather than Nuxt's `500` around a plain
 * object.
 */
export function failureOrigin(variant: TaggedError): NuxtError | undefined {
  return failureOrigins().get(variant)
}

/**
 * What a failed call is to its caller: the route's Known error when the
 * response body carries a Tagged error, handed back itself rather than
 * copied; otherwise the Request-failed variant, with the response's status
 * and the failure as a `NuxtError`. Either variant is linked to that
 * `NuxtError` for {@link failureOrigin}.
 */
export function classifyFailure(cause: unknown): TaggedError | RequestFailed {
  const error = toNuxtError(cause)
  const variant: TaggedError | RequestFailed = fetchedTagged(error) ?? {
    _tag: 'request-failed',
    status: statusOf(cause),
    cause: error,
  }

  failureOrigins().set(variant, error)

  return variant
}

/**
 * Run a call and resolve to its result instead of throwing: `data` on
 * success, otherwise `error`, exhaustive on `_tag` over the Known errors `E`
 * the caller declares plus the Request-failed variant. Everything a fetch can
 * throw - an HTTP failure, a network failure, an abort, a parse error - is
 * caught; nothing is rethrown.
 */
export async function toTryResult<T, E extends TaggedError = never>(
  call: () => Promise<T>
): Promise<TryResult<T, E | RequestFailed>> {
  try {
    return { data: await call(), error: undefined }
  } catch (cause) {
    // SAFETY: a Tagged error in a failure's body is the route's own Known
    // error - the body's `_tag` is the server's word for which declared
    // variant it is, and `E` is the caller's statement of that route's
    // declared union. A tag the caller does not know (deploy skew) is what
    // `matchError`'s fallback exists for.
    const error = classifyFailure(cause) as E | RequestFailed

    return { data: undefined, error }
  }
}
