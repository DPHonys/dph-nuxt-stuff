/**
 * `event.$typedFetch` at run time: a header merge that is the **inverse** of
 * the global's, plus the same `toTypedResult` the global uses, imported
 * rather than rewritten. Kept out of the plugin beside it so the thing
 * underneath is a parameter the tests can model with nothing booted.
 */

import type { RawTypedResult } from '../typed-fetch'
import { toTypedResult } from '../typed-fetch'
import type { Event$TypedFetch } from '../types'

// ---------------------------------------------------------------------------
// What this wrapper needs of the thing underneath it
// ---------------------------------------------------------------------------

/**
 * The one option this wrapper reads; everything else forwards untouched.
 * Named `RawInit` because h3's `fetchWithEvent(event, req, init, options)`
 * has an `options` of its own, and it is not this one.
 */
interface RawInit {
  headers?: HeadersInit
}

/**
 * `event.$fetch`, reduced to the shape this file touches — the real interface
 * would make this forwarding path fight route-literal inference. The claim
 * that the wrapper really is `event.$fetch`-shaped is made once, by the cast
 * ending {@link createEventTypedFetch}.
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
 * No instance-defaults check on purpose: this surface has none, and h3
 * ignores the incoming request's own `accept` when forwarding —
 * `if (!headers.has('accept'))` is the whole rule.
 */
function withAcceptJson(init: RawInit | undefined): RawInit {
  const headers = new Headers(init?.headers)

  if (!headers.has(ACCEPT)) headers.set(ACCEPT, ACCEPT_JSON)

  return { ...init, headers: Object.fromEntries(headers) }
}

// ---------------------------------------------------------------------------
// The wrapper
// ---------------------------------------------------------------------------

/**
 * Thrown when `event.$fetch` is not a function at call time.
 *
 * This module rides Nitro's `@experimental` `event.$fetch`. A consumer
 * running a newer nitro/h3 than this module was built against may find the
 * property gone at runtime — without this guard the failure is a bare
 * `event.$fetch is not a function` with nothing pointing at the version skew
 * that caused it.
 */
export class EventFetchUnavailableError extends Error {
  override name = 'EventFetchUnavailableError'

  constructor() {
    super(
      'event.$typedFetch: `event.$fetch` is not a function on this event. ' +
        'nuxt-handler-errors wraps Nitro’s experimental `event.$fetch`, and the ' +
        'installed nitro/h3 no longer provides it — the runtime is newer than ' +
        'the versions this module supports (version skew). Upgrade ' +
        'nuxt-handler-errors, or pin nitro/h3 to a supported version.'
    )
  }
}

/**
 * Build the event-bound namespace over the event's own fetch. `getBase` is a
 * thunk so the wrapper composes with later `event.$fetch` replacements; the
 * first call checks it really answers a function and throws
 * {@link EventFetchUnavailableError} when it does not — once, not per call,
 * because the check exists to name the skew, not to police replacements.
 *
 * No second try/catch here — the false-arm rule is the same on both surfaces
 * and a second copy could drift. The cast makes `createTypedFetch`'s two
 * claims.
 */
export function createEventTypedFetch(
  getBase: () => RawEventFetch | undefined
): Event$TypedFetch {
  let verified = false

  const call = (request: unknown, init?: RawInit): Promise<unknown> => {
    const base = getBase()

    if (!verified) {
      if (typeof base !== 'function') throw new EventFetchUnavailableError()
      verified = true
    }

    return (base as RawEventFetch)(request, withAcceptJson(init))
  }

  return Object.assign(call, {
    safe: (request: unknown, init?: RawInit): Promise<RawTypedResult> =>
      toTypedResult(() => call(request, init)),
  }) as unknown as Event$TypedFetch
}
