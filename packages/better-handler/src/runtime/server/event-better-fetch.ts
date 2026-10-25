/**
 * `event.$betterFetch`: the event's own `$fetch` with `.try` and a JSON
 * `accept` header, typed as `$betterFetch` is. Installed on every event by a
 * `request` hook, the earliest point Nitro's `event.$fetch` exists.
 */

import type { H3Event } from 'h3'
import { toTryResult } from '../shared/errors/try-result'
import type { BetterFetch } from '../types/fetch'

// Named `RawInit` because h3's `fetchWithEvent(event, req, init, options)`
// has an `options` of its own, and it is not this one.
interface RawInit {
  headers?: HeadersInit
}

/**
 * `event.$fetch` reduced to the shape this file touches, with the
 * route-typed generics erased. `Body` is what a call resolves to.
 */
export type RawEventFetch<Body> = (
  request: string | Request,
  init?: RawInit
) => Promise<Body>

const ACCEPT = 'accept'

// Why the header is forced: see the global's twin in `shared/better-fetch.ts`.
const ACCEPT_JSON = 'application/json'

// Flattened to a plain object, the inverse of the global's rule: underneath is
// h3's `fetchWithEvent`, which merges headers by object spread, and a
// `Headers` instance spreads to nothing. h3 never forwards the incoming
// request's own `accept`, so only the caller's can be present.
function withAcceptJson(init: RawInit | undefined): RawInit {
  const headers = new Headers(init?.headers)

  if (!headers.has(ACCEPT)) headers.set(ACCEPT, ACCEPT_JSON)

  return { ...init, headers: Object.fromEntries(headers) }
}

/**
 * Thrown when `event.$fetch` is missing the first time `event.$betterFetch`
 * is called: the package wraps Nitro's experimental `event.$fetch`, and a
 * newer Nitro or h3 may stop providing it. Names the version skew instead of
 * a bare `TypeError`.
 */
export class EventFetchUnavailableError extends Error {
  override name = 'EventFetchUnavailableError'

  constructor() {
    super(
      '[better-handler] event.$betterFetch cannot run: this event has no ' +
        '`event.$fetch`. @dphonys/better-handler wraps Nitro’s experimental ' +
        '`event.$fetch`, and the installed Nitro or h3 no longer provides it, ' +
        'so the runtime is newer than the versions this package supports. ' +
        'Upgrade @dphonys/better-handler, or pin Nitro and h3 to a supported version.'
    )
  }
}

/**
 * The event-bound instance over the event's own fetch. `getBase` is read on
 * every call, so the wrapper composes with a later `event.$fetch`
 * replacement. The instance is the call and `.try` only: `event.$fetch` is a
 * bare closure over `fetchWithEvent`, with no `.raw` or `.create` to forward.
 */
export function createEventBetterFetch<Body>(
  getBase: () => RawEventFetch<Body> | undefined
): BetterFetch {
  let verified = false

  const verifiedBase = (): RawEventFetch<Body> => {
    const base = getBase()

    // Checked once: past the first call a missing base is a later
    // replacement's failure, reported as the bare `event.$fetch()` would
    // report it, since skew was ruled out then.
    if (base === undefined) {
      throw verified
        ? new TypeError('event.$fetch is not a function')
        : new EventFetchUnavailableError()
    }

    verified = true

    return base
  }

  const call = (request: string | Request, init?: RawInit): Promise<Body> =>
    verifiedBase()(request, withAcceptJson(init))

  const better = Object.assign(call, {
    // The skew check runs outside `toTryResult`: version skew is not a
    // failed request, and classifying it would bury the message naming it.
    try: (request: string | Request, init?: RawInit) => {
      verifiedBase()

      return toTryResult(() => call(request, init))
    },
  })

  // SAFETY: `BetterFetch` is vanilla's route-typed call plus `.try`. Both
  // members forward to `event.$fetch` with only the `accept` header added, so
  // the response types are the ones Nitro claims for `event.$fetch` per
  // route; `.try` classifies a rejection through `toTryResult`. The
  // request-side types only narrow what a caller may pass.
  return better as BetterFetch
}

/**
 * The two members of an event the installer touches: `$fetch`, read on every
 * call, and `$betterFetch`, written once. Nitro's own `event.$fetch` and the
 * reduced shape are both admitted, and `undefined` is the version skew the
 * wrapper names.
 */
export interface EventFetchSlots {
  $fetch?: H3Event['$fetch'] | RawEventFetch<unknown> | undefined
  $betterFetch?: BetterFetch
}

/** Install `event.$betterFetch` over the event's own fetch. */
export function installEventBetterFetch(event: EventFetchSlots): void {
  // SAFETY: Nitro's `event.$fetch` is `fetchWithEvent` over the global
  // `$fetch`, which takes a request and an init and resolves the body:
  // exactly `RawEventFetch` with the route-typed generics erased.
  event.$betterFetch = createEventBetterFetch(
    () => event.$fetch as RawEventFetch<unknown> | undefined
  )
}

/** What the installer needs from Nitro's app: a `request` hook. */
export interface RequestHookHost {
  hooks: {
    hook: (name: 'request', callback: (event: H3Event) => void) => void
  }
}

/** Install `event.$betterFetch` on every request, as early as it can exist. */
export function registerEventBetterFetch(nitroApp: RequestHookHost): void {
  nitroApp.hooks.hook('request', installEventBetterFetch)
}
