// Installs `event.$checkedFetch` on every request. The `request` hook is the
// earliest point at which `event.$fetch` exists to be wrapped. Wrapping the
// EVENT's fetch rather than the global is the point: it forwards the incoming
// request's headers and cookies; `globalThis.$fetch` forwards none of it.

import { configuredChannelToken } from '#nuxt-handler-errors/channel-token'
import { defineNitroPlugin } from 'nitropack/runtime'
import type { RawEventFetch } from '../lib/event-checked-fetch'
import { createCheckedEventFetch } from '../lib/event-checked-fetch'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    event.$checkedFetch = createCheckedEventFetch(
      () => event.$fetch as unknown as RawEventFetch | undefined,
      configuredChannelToken
    )
  })
})
