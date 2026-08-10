import { configuredChannelToken } from '#nuxt-handler-errors/channel-token'
import { defineNitroPlugin } from 'nitropack/runtime'
import type { RawEventFetch } from '../lib/event-checked-fetch'
import { createCheckedEventFetch } from '../lib/event-checked-fetch'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    event.$checkedFetch = createCheckedEventFetch(
      () => event.$fetch as RawEventFetch | undefined,
      configuredChannelToken
    )
  })
})
