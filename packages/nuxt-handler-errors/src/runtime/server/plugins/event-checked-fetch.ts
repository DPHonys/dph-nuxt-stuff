/**
 * Installs `event.$checkedFetch` on every request.
 *
 * The `request` hook is the right line: Nitro's `onRequest` assigns its four
 * per-request closures — `event.fetch`, `event.$fetch`, `event.waitUntil`,
 * `event.captureError` — and then calls this hook, so this is the earliest
 * point at which `event.$fetch` exists to be wrapped, and it makes this a fifth
 * closure alongside four that already exist rather than a new per-request cost
 * of its own.
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
 * change in user code — and at run time the wrapper's first-call guard names
 * the skew.
 */

import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime'
import { readChannelToken } from '../../shared/channel'
import type { RawEventFetch } from '../lib/event-checked-fetch'
import { createCheckedEventFetch } from '../lib/event-checked-fetch'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    // The channel tag read per request and handed in, rather than taken from
    // the box the two globals share: this plugin must not depend on the other
    // one having run.
    const token = readChannelToken(useRuntimeConfig(event))

    event.$checkedFetch = createCheckedEventFetch(
      () => event.$fetch as unknown as RawEventFetch | undefined,
      token
    )
  })
})
