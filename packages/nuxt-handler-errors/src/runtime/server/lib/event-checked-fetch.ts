/**
 * `event.$checkedFetch` at run time: a header merge that is the **inverse** of
 * the global's, plus the same `toTryResult` the global uses, imported rather
 * than rewritten. Kept out of the plugin beside it so the thing underneath is a
 * parameter the tests can model with nothing booted.
 */

import { CHANNEL_HEADER } from '../../shared/channel'
import type { RawTryResult } from '../../shared/checked-fetch'
import { toTryResult } from '../../shared/checked-fetch'
import type { CheckedFetch } from '../../types'

// ---------------------------------------------------------------------------
// What this wrapper needs of the thing underneath it
// ---------------------------------------------------------------------------

/**
 * The one option this wrapper reads; everything else forwards untouched. Named
 * `RawInit` because h3's `fetchWithEvent(event, req, init, options)` has an
 * `options` of its own, and it is not this one.
 */
interface RawInit {
  headers?: HeadersInit
}

/**
 * `event.$fetch`, reduced to the shape this file touches — the real interface
 * would make this forwarding path fight route-literal inference. The claim that
 * the wrapper really is `event.$fetch`-shaped is made once, by the cast ending
 * {@link createCheckedEventFetch}.
 */
export type RawEventFetch = (
  request: unknown,
  init?: RawInit
) => Promise<unknown>

// ---------------------------------------------------------------------------
// The header merge — the EVENT-BOUND form
// ---------------------------------------------------------------------------

const ACCEPT = 'accept'
const ACCEPT_JSON = 'application/json'

/**
 * The call's headers with `accept` added when the call does not carry one,
 * built through a `Headers` and then **flattened to a plain object** — the
 * inverse of the global's rule. Underneath is h3's `fetchWithEvent`, which
 * merges headers by object spread; a `Headers` instance has no own enumerable
 * properties, so handing it on whole (the global's correct fix) spreads to
 * nothing and silently discards the caller's headers *and* the `accept`.
 *
 * No instance-defaults check on purpose: this surface has none, and h3 strips
 * the incoming request's own `accept` when forwarding —
 * `if (!headers.has('accept'))` is the whole rule.
 */
function withCheckedHeaders(
  init: RawInit | undefined,
  token: string | undefined
): RawInit {
  const headers = new Headers(init?.headers)

  if (!headers.has(ACCEPT)) headers.set(ACCEPT, ACCEPT_JSON)

  // The channel tag, when the consumer configured one — the same `set` rule as
  // the other two merge forms: this header is the module's own.
  if (token !== undefined) headers.set(CHANNEL_HEADER, token)

  return { ...init, headers: Object.fromEntries(headers) }
}

// ---------------------------------------------------------------------------
// The wrapper
// ---------------------------------------------------------------------------

/**
 * Thrown when `event.$fetch` is not a function at call time.
 *
 * This module rides Nitro's `@experimental` `event.$fetch`. A consumer running
 * a newer nitro/h3 than this module was built against may find the property
 * gone at run time — without this guard the failure is a bare
 * `event.$fetch is not a function` with nothing pointing at the version skew
 * that caused it.
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
 * thunk so the wrapper composes with later `event.$fetch` replacements; the
 * first call checks it really answers a function and throws
 * {@link EventFetchUnavailableError} when it does not — once, not per call,
 * because the check exists to name the skew, not to police replacements.
 *
 * The instance is the seam **exactly**: the call and `.try`, no `.raw` and no
 * `.create`, because `event.$fetch` is a bare closure over `fetchWithEvent`
 * and growing either member would offer calls that cannot be made.
 *
 * No second try/catch here — `.try`'s normalisation is the same on both
 * surfaces and a second copy could drift. The cast makes `createCheckedFetch`'s
 * two claims.
 *
 * `token` is passed in rather than read from the shared box the two globals
 * use: this wrapper is built per request by its own plugin, which can read
 * `useRuntimeConfig(event)` itself, and depending on the *other* plugin having
 * run first would make plugin order load-bearing for the channel tag.
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
    // The skew guard runs **outside** the try/catch: version skew is not a
    // fetch failure, and normalising it into a carrier would bury the one
    // message that names what happened.
    try: (request: unknown, init?: RawInit): Promise<RawTryResult> => {
      verifiedBase()

      return toTryResult(() => call(request, init))
    },
  }) as unknown as CheckedFetch
}
