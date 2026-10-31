import type {
  BetterFetch,
  RequestFailed,
  TaggedError,
} from '../../../../src/runtime/types'

/** What one relay reports; the fixture's routes answer plain objects. */
interface Observed {
  readonly order: unknown
  readonly missing: TaggedError | undefined
  readonly legacy: TaggedError | undefined
  readonly unavailable:
    | Pick<RequestFailed, '_tag' | 'status'>
    | TaggedError
    | undefined
  readonly echoed: unknown
  readonly ownAccept: unknown
}

/**
 * What a relay route reports of one fetch surface, called from inside the
 * server: a response, three failures as `.try` classifies them, and the
 * headers a callee received with and without the caller's own `accept`.
 */
export async function observe(fetch: BetterFetch): Promise<Observed> {
  const order = await fetch('/api/orders/7')
  const missing = await fetch.try('/api/orders/404')
  const legacy = await fetch.try('/legacy/404')
  const unavailable = await fetch.try('/api/unavailable')

  return {
    order,
    missing: missing.error,
    legacy: legacy.error,
    // The Request-failed variant's `cause` is an error object, which JSON
    // cannot carry whole: its tag and status are what is judged.
    unavailable:
      unavailable.error?._tag === 'request-failed'
        ? { _tag: unavailable.error._tag, status: unavailable.error.status }
        : unavailable.error,
    echoed: await fetch('/api/echo'),
    ownAccept: await fetch('/api/echo', { headers: { accept: 'text/plain' } }),
  }
}
