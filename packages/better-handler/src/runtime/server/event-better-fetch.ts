/**
 * `event.$betterFetch`: the event's own `$fetch` with `.try` and a JSON
 * `accept` header, typed as `$betterFetch` is. A lazy getter on h3's event
 * prototype, so every event has it, however it was created.
 */

import type { H3Event } from 'h3'
import { toTryResult } from '../shared/errors/try-result'
import { eventPrototype } from '../shared/h3'
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
 * The two members of an event the getter touches: `$fetch`, read on every
 * call, and `$betterFetch`, which it serves. Nitro's own `event.$fetch` and
 * the reduced shape are both admitted, and `undefined` is the version skew
 * the wrapper names.
 */
export interface EventFetchSlots {
  $fetch?: H3Event['$fetch'] | RawEventFetch<unknown> | undefined
  $betterFetch?: BetterFetch
}

const MEMBER = '$betterFetch'

/** Each event's instance, built the first time the event's member is read. */
const instances = new WeakMap<EventFetchSlots, BetterFetch>()

/**
 * Give every event inheriting from `prototype` a lazy `$betterFetch`: built
 * over that event's own `$fetch` the first time it is read, then kept for
 * the event's life. On the prototype rather than on each request's event, so
 * an event created past every hook has it too: the fresh one Nitro runs a
 * `defineCachedEventHandler` or `cache`/`swr` route rule on. An event that
 * never reads it costs nothing. Installing twice keeps the first getter.
 */
export function installEventBetterFetch(prototype: EventFetchSlots): void {
  if (Object.hasOwn(prototype, MEMBER)) return

  Object.defineProperty(prototype, MEMBER, {
    configurable: true,
    get(this: EventFetchSlots): BetterFetch {
      let better = instances.get(this)

      if (better === undefined) {
        // SAFETY: Nitro's `event.$fetch` is `fetchWithEvent` over the global
        // `$fetch`, which takes a request and an init and resolves the body:
        // exactly `RawEventFetch` with the route-typed generics erased.
        better = createEventBetterFetch(
          () => this.$fetch as RawEventFetch<unknown> | undefined
        )
        instances.set(this, better)
      }

      return better
    },
    // `H3Event['$betterFetch']` is a plain member, so assigning one works.
    set(this: EventFetchSlots, better: BetterFetch): void {
      instances.set(this, better)
    },
  })
}

/** What the installer needs from Nitro's app: a `request` hook. */
export interface RequestHookHost {
  hooks: {
    hook: (name: 'request', callback: (event: EventFetchSlots) => void) => void
  }
}

// Nitro may run on another copy of h3 than the one this package resolves, and
// each copy has its own event class: the incoming event's own prototype gets
// the getter too, the one a cached handler's event shares with it.
function installOnPrototypeOf(event: EventFetchSlots): void {
  // SAFETY: an event's prototype is its class's, which holds the members its
  // events inherit: the same two slots, each possibly absent.
  installEventBetterFetch(Object.getPrototypeOf(event) as EventFetchSlots)
}

/** Give every event `event.$betterFetch`, whoever creates the event. */
export function registerEventBetterFetch(nitroApp: RequestHookHost): void {
  installEventBetterFetch(eventPrototype())
  nitroApp.hooks.hook('request', installOnPrototypeOf)
}
