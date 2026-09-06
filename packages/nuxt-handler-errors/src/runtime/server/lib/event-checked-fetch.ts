import type { NitroFetchRequest } from 'nitropack/types'
import type { NuxtError } from 'nuxt/app'
import { CHANNEL_HEADER } from '../../shared/channel'
import { toTryResult } from '../../shared/checked-fetch-factory'
import type { CheckedFetch, TryResult } from '../../types'

// Named `RawInit` because h3's `fetchWithEvent(event, req, init, options)`
// has an `options` of its own, and it is not this one.
interface RawInit {
  headers?: HeadersInit
}

/**
 * `event.$fetch`, reduced to the shape this file touches. `Body` is the
 * instance-level claim, `unknown` on Nitro's own declaration - the body is
 * route-typed per call and nothing at the instance level.
 */
export type RawEventFetch<Body> = (
  request: NitroFetchRequest,
  init?: RawInit
) => Promise<Body>

const ACCEPT = 'accept'
const ACCEPT_JSON = 'application/json'

// Flattened to a plain object - the inverse of the global's rule: underneath
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
 * Thrown when `event.$fetch` is missing at call time - this module rides
 * Nitro's `@experimental` `event.$fetch`, and a newer nitro/h3 may drop it.
 * The guard names the version skew instead of a bare TypeError.
 */
export class EventFetchUnavailableError extends Error {
  override name = 'EventFetchUnavailableError'

  constructor() {
    super(
      'event.$checkedFetch: `event.$fetch` is not a function on this event. ' +
        'nuxt-handler-errors wraps Nitro’s experimental `event.$fetch`, and the ' +
        'installed nitro/h3 no longer provides it - the runtime is newer than ' +
        'the versions this module supports (version skew). Upgrade ' +
        'nuxt-handler-errors, or pin nitro/h3 to a supported version.'
    )
  }
}

// What a verified wrapper calls when its base has since gone: the same
// TypeError the bare `event.$fetch()` would raise, deliberately not the
// skew error - skew was ruled out at verification.
const failMissingBase: RawEventFetch<never> = () =>
  Promise.reject(new TypeError('event.$fetch is not a function'))

/**
 * Build the event-bound instance over the event's own fetch. `getBase` is a
 * thunk so the wrapper composes with later `event.$fetch` replacements, and
 * answers `undefined` for the skew the guard names. The instance is the seam
 * exactly - the call and `.try`, no `.raw` and no `.create` - because
 * `event.$fetch` is a bare closure over `fetchWithEvent`.
 */
export function createCheckedEventFetch<Body>(
  getBase: () => RawEventFetch<Body> | undefined,
  token?: string
): CheckedFetch {
  let verified = false

  const verifiedBase = (): RawEventFetch<Body> => {
    const base = getBase()

    if (!verified) {
      if (base === undefined) throw new EventFetchUnavailableError()
      verified = true
    }

    // A verified wrapper does not re-police later replacements: past the
    // first call, a missing base is the replacement's failure to report.
    return base ?? failMissingBase
  }

  const call = (request: NitroFetchRequest, init?: RawInit): Promise<Body> =>
    verifiedBase()(request, withCheckedHeaders(init, token))

  const checked = Object.assign(call, {
    // The skew guard runs OUTSIDE the try/catch: version skew is not a fetch
    // failure, and normalising it would bury the message naming it.
    try: (
      request: NitroFetchRequest,
      init?: RawInit
    ): Promise<TryResult<Body, NuxtError>> => {
      verifiedBase()

      return toTryResult(() => call(request, init))
    },
  })

  // SAFETY: `CheckedFetch` is vanilla's route-typed call plus `.try`; both
  // members forward to `event.$fetch` with only headers added, so the
  // route-typed claims are the ones Nitro already makes for `event.$fetch`.
  // `Body` is the instance-level claim, restated per route by the overloads.
  return checked as CheckedFetch
}
