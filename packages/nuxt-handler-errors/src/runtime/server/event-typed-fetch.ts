/**
 * `event.$typedFetch` — the server-to-server surface (SPEC.md §3.6).
 *
 * The type-level half lives on {@link Event$TypedFetch} in `../types`: why it
 * is the bare call signature plus `.safe` and nothing else, and why it is not a
 * copy of the global's namespace. This file is the run time, and it is two
 * things: **a header merge that is the inverse of the global's**, and the
 * *same* `toTypedResult` the global uses, imported rather than rewritten.
 *
 * Kept out of the plugin beside it so the thing underneath is a **parameter**.
 * That is the whole seam: what reaches it is exactly what would have reached
 * h3's `fetchWithEvent`, so `test/event-typed-fetch.test.ts` can model
 * `fetchWithEvent`'s own merge and assert on what would go on the wire, with
 * nothing booted.
 */

import type { RawTypedResult } from '../typed-fetch'
import { toTypedResult } from '../typed-fetch'
import type { Event$TypedFetch } from '../types'

// ---------------------------------------------------------------------------
// What this wrapper needs of the thing underneath it
// ---------------------------------------------------------------------------

/**
 * The one option this wrapper reads. Everything else is forwarded untouched.
 *
 * Named `RawInit` rather than `../typed-fetch`'s identical `RawOptions` because
 * that is what the thing underneath calls it: h3's `fetchWithEvent(event, req,
 * init, options)` has an `options` of its own, and it is not this one. The two
 * declarations are not shared for the reason the merge below is not — see
 * SPEC.md §3.8.
 */
interface RawInit {
  headers?: HeadersInit
}

/**
 * `event.$fetch`, reduced to the shape this file touches.
 *
 * Deliberately not Nitro's `H3Event$Fetch`, for the reason `../typed-fetch`
 * gives about `RawFetch`: typing the parameter as the real interface would make
 * this forwarding path fight route-literal inference for no gain. The claim
 * that the wrapper's signature really is `event.$fetch`'s is made once, by the
 * cast at the end of {@link createEventTypedFetch}.
 */
export type RawEventFetch = (
  request: unknown,
  init?: RawInit
) => Promise<unknown>

// ---------------------------------------------------------------------------
// The header merge — the EVENT-BOUND form (SPEC.md §3.8)
// ---------------------------------------------------------------------------

const ACCEPT = 'accept'
const ACCEPT_JSON = 'application/json'

/**
 * The call's headers with `accept` added when the call does not carry one,
 * built through a `Headers` and then **flattened to a plain object**.
 *
 * ## The flatten is the difference, and it inverts the global's rule
 *
 * SPEC.md §3.8's title says one shared helper across the three merges would be
 * a defect, and this surface is why. What sits underneath here is **not an
 * ofetch instance**: it is h3's `fetchWithEvent`, which builds its request
 * options by object spread —
 *
 * ```js
 * headers: { ...getProxyRequestHeaders(event, …), ...init?.headers }
 * ```
 *
 * `h3@1.15.11 dist/index.mjs:1263-1274`. A `Headers` instance has **no own
 * enumerable properties**, so the global wrapper's correct fix — hand the
 * `Headers` on whole, which ofetch's `mergeHeaders` takes properly — spreads to
 * *nothing* here and silently discards both the caller's headers and this
 * module's own `accept`. `Object.fromEntries` is what makes the merge visible
 * to a spread while keeping `new Headers(init)` as the one construction that
 * accepts all three legal input forms (plain object, tuple array, `Headers`)
 * and `has()` as the one check that sees a caller's own `accept` in all three.
 *
 * SPEC.md §3.8's own table, which is what this function is:
 *
 * ```
 *                         MERGED WITH FORWARDED HEADERS
 * Headers instance    ->  {cookie, user-agent}                    // everything lost
 * tuple array         ->  {"0":[…], "1":[…], cookie, user-agent}  // corrupted
 * plain object        ->  {cookie, user-agent, accept, authorization}
 * Object.fromEntries  ->  {cookie, user-agent, accept, authorization}   // the fix
 * ```
 *
 * ## Losing `accept` here is not cosmetic
 *
 * Nitro's `isJsonRequest` decides whether a failure comes back as JSON or as a
 * rendered HTML error page, and its last resort is
 * `event.path.startsWith('/api/')` — which fails for a callee outside `/api/**`
 * and for **every** route under a non-root `app.baseURL`, since ofetch prefixes
 * it and `/shop/api/x` does not pass the test. Lose the header and the envelope
 * is gone: a *declared* failure arrives as an undeclared parse failure.
 *
 * ## There is no three-way check, and that is measured rather than assumed
 *
 * The global's rule is *set `accept` only when neither the call nor the
 * instance defaults carry it*, and it needs `create`'s closure for the second
 * half. This surface has no `create` and no instance, so there are no defaults
 * to consult — and h3 lists `accept` in its `ignoredHeaders`
 * (`dist/index.mjs:1138-1147`), so the incoming request's own `accept` is never
 * among the forwarded headers either. `if (!headers.has('accept'))` is the
 * whole rule.
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
 * This module rides Nitro's `@experimental` `event.$fetch`. A consumer running
 * a newer nitro/h3 than this module was built against may find the property
 * gone at runtime — without this guard the failure is a bare
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
 * Build the event-bound namespace over the event's own fetch (SPEC.md §3.6).
 *
 * `getBase` is a thunk so the wrapper composes with anything that replaces
 * `event.$fetch` later in the same hook chain. The first call checks the thunk
 * really answers a function and throws {@link EventFetchUnavailableError} when
 * it does not — once, not per call, because the check exists only to name the
 * nitro/h3 skew that removed the property, not to police later replacements.
 *
 * Two members, because that is what `event.$fetch` has plus one: the call
 * signature forwards, and `.safe` runs `toTypedResult` over it. **No second
 * try/catch is written here** — the rule about what may reach the false arm is
 * the same rule on both surfaces, and a second copy of it could drift. Only the
 * header merge is this file's own.
 *
 * The cast at the end is the same one `createTypedFetch` makes and it is the
 * same two claims: that a forwarding `(request, init) => Promise<unknown>`
 * inhabits `event.$fetch`'s route-literal-inferring signature, which it does
 * because it forwards; and that the `AnyVariant` floor the reader answered is a
 * member of the callee's declared union, which is SPEC.md §6.4's documented
 * deploy-skew tail.
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
