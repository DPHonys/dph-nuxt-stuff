import { configuredChannelToken } from '#nuxt-handler-errors/channel-token'
import { defineNitroPlugin } from 'nitropack/runtime'
import type { RawEventFetch } from '../lib/event-checked-fetch'
import { createCheckedEventFetch } from '../lib/event-checked-fetch'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    // SAFETY: `RawEventFetch<unknown>` is Nitro's `event.$fetch` with the
    // route-typed response generics erased - the same closure, whose body is
    // typed per route and `unknown` at the instance level on both faces.
    // `undefined` is the version skew the wrapper's guard names.
    const base = (): RawEventFetch<unknown> | undefined =>
      event.$fetch as RawEventFetch<unknown>

    event.$checkedFetch = createCheckedEventFetch(base, configuredChannelToken)
  })
})
