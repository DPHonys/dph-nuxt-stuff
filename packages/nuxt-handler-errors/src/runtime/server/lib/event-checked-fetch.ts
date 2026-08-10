// Kept out of the plugin beside it so the thing underneath is a parameter the
// tests can model with nothing booted.

import { CHANNEL_HEADER } from '../../shared/channel'
import type { RawTryResult } from '../../shared/checked-fetch'
import { toTryResult } from '../../shared/checked-fetch'
import type { CheckedFetch } from '../../types'

// Named `RawInit` because h3's `fetchWithEvent(event, req, init, options)`
// has an `options` of its own, and it is not this one.
interface RawInit {
  headers?: HeadersInit
}

/** `event.$fetch`, reduced to the shape this file touches. */
export type RawEventFetch = (
  request: unknown,
  init?: RawInit
) => Promise<unknown>

const ACCEPT = 'accept'
const ACCEPT_JSON = 'application/json'

// Flattened to a plain object — the inverse of the global's rule: underneath
// is h3's `fetchWithEvent`, which merges headers by object spread, and a
// `Headers` instance spreads to nothing.
function withCheckedHeaders(
  init: RawInit | undefined,
  token: string | undefined
): RawInit {
  const headers = new Headers(init?.headers)

  if (!headers.has(ACCEPT)) headers.set(ACCEPT, ACCEPT_JSON)

  if (token !== undefined) headers.set(CHANNEL_HEADER, token)

  return { ...init, headers: Object.fromEntries(headers) }
}

/**
 * Thrown when `event.$fetch` is not a function at call time — this module
 * rides Nitro's `@experimental` `event.$fetch`, and a newer nitro/h3 may drop
 * it. The guard names the version skew instead of a bare TypeError.
 */
export class EventFetchUnavailableError extends Error {
  override name = 'EventFetchUnavailableError'

  constructor() {
    super(
      'event.$checkedFetch: `event.$fetch` is not a function on this event. ' +
        'nuxt-handler-errors wraps Nitro’s experimental `event.$fetch`, and the ' +
        'installed nitro/h3 no longer provides it — the runtime is newer than ' +
        'the versions this module supports (version skew). Upgrade ' +
        'nuxt-handler-errors, or pin nitro/h3 to a supported version.'
    )
  }
}

/**
 * Build the event-bound instance over the event's own fetch. `getBase` is a
 * thunk so the wrapper composes with later `event.$fetch` replacements. The
 * instance is the seam exactly — the call and `.try`, no `.raw` and no
 * `.create` — because `event.$fetch` is a bare closure over `fetchWithEvent`.
 */
export function createCheckedEventFetch(
  getBase: () => RawEventFetch | undefined,
  token?: string
): CheckedFetch {
  let verified = false

  const verifiedBase = (): RawEventFetch => {
    const base = getBase()

    if (!verified) {
      if (typeof base !== 'function') throw new EventFetchUnavailableError()
      verified = true
    }

    return base as RawEventFetch
  }

  const call = (request: unknown, init?: RawInit): Promise<unknown> =>
    verifiedBase()(request, withCheckedHeaders(init, token))

  return Object.assign(call, {
    // The skew guard runs OUTSIDE the try/catch: version skew is not a fetch
    // failure, and normalising it would bury the message naming it.
    try: (request: unknown, init?: RawInit): Promise<RawTryResult> => {
      verifiedBase()

      return toTryResult(() => call(request, init))
    },
  }) as unknown as CheckedFetch
}
