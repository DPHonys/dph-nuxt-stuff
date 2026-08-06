/**
 * Installs `event.$typedFetch` on every request (SPEC.md §3.6).
 *
 * ## Why the `request` hook, and why it is the right line
 *
 * Nitro's `onRequest` assigns four per-request closures — `event.fetch`,
 * `event.$fetch`, `event.waitUntil` and `event.captureError` — and then calls
 * this hook, in that order
 * (`nitropack@2.13.4 dist/runtime/internal/app.mjs:61-77`). So this is the line
 * immediately after Nitro's own, which is the earliest point at which
 * `event.$fetch` exists to be wrapped, and it makes this a **fifth closure
 * alongside four that already exist** rather than a new per-request cost of its
 * own. SPEC.md §3.6 accepts the module gaining runtime presence on every
 * request on exactly that basis: Nitro's own idiom, at Nitro's own cost.
 *
 * ## Wrapping the event's fetch rather than the global is the whole point
 *
 * `event.$fetch` is a closure over h3's `fetchWithEvent`, which forwards the
 * incoming request's headers and cookies, and hands the callee the caller's
 * `context` object — out of which Nitro then surfaces exactly `_platform` and
 * `waitUntil` (`nitropack@2.13.4 dist/runtime/internal/app.mjs:48-59`; the
 * precise statement is on `Event$TypedFetch` in `../types`).
 * `globalThis.$fetch` forwards none of it. The global `$typedFetch` already
 * works verbatim inside a Nitro handler (SPEC.md §3.5) — this member exists for
 * the forwarding and for nothing else.
 *
 * It is read through a thunk rather than captured, so the wrapper composes with
 * anything else that replaces `event.$fetch` later in the same hook chain.
 *
 * ## The `@experimental` ride
 *
 * Nitro marks both `event.fetch` and `event.$fetch` `@experimental`. Accepted
 * (SPEC.md §3.6): if `event.$fetch` moves, the failure is a compile error in
 * this one module file rather than a silent behaviour change in user code.
 */

import { defineNitroPlugin } from 'nitropack/runtime'
import { createEventTypedFetch } from './event-typed-fetch'
import type { RawEventFetch } from './event-typed-fetch'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    event.$typedFetch = createEventTypedFetch(
      () => event.$fetch as unknown as RawEventFetch | undefined
    )
  })
})
