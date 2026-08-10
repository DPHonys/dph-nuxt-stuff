/**
 * Installs `event.$typedFetch` on every request.
 *
 * The `request` hook is the right line: Nitro's `onRequest` assigns its four
 * per-request closures — `event.fetch`, `event.$fetch`, `event.waitUntil`,
 * `event.captureError` — and then calls this hook, so this is the earliest
 * point at which `event.$fetch` exists to be wrapped, and it makes this a
 * fifth closure alongside four that already exist rather than a new
 * per-request cost of its own.
 *
 * Wrapping the **event's** fetch rather than the global is the whole point:
 * `event.$fetch` is a closure over h3's `fetchWithEvent`, which forwards the
 * incoming request's headers and cookies plus `_platform` and `waitUntil`;
 * `globalThis.$fetch` forwards none of it. It is read through a thunk rather
 * than captured, so the wrapper composes with anything else that replaces
 * `event.$fetch` later in the same hook chain.
 *
 * Nitro marks `event.$fetch` `@experimental`. Accepted: if it moves, the
 * failure is a compile error in this one file rather than a silent behaviour
 * change in user code — and at runtime, the wrapper's first-call guard names
 * the skew.
 */

import { defineNitroPlugin } from 'nitropack/runtime'
import { createEventTypedFetch } from '../lib/event-typed-fetch'
import type { RawEventFetch } from '../lib/event-typed-fetch'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    event.$typedFetch = createEventTypedFetch(
      () => event.$fetch as unknown as RawEventFetch | undefined
    )
  })
})
