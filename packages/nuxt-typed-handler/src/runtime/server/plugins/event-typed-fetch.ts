import { configuredChannelToken } from '#nuxt-typed-handler/channel-token'
import type { RawEventFetch } from '@dphonys/nuxt-handler-errors/internals/server'
import { createCheckedEventFetch } from '@dphonys/nuxt-handler-errors/internals/server'
import { defineNitroPlugin } from 'nitropack/runtime'
import type { TypedEventFetch } from '../../types/fetch'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    // The parent's event-bound factory, handed the umbrella's token; the
    // umbrella owns only the type, applied with this one cast.
    event.$typedFetch = createCheckedEventFetch(
      () => event.$fetch as RawEventFetch | undefined,
      configuredChannelToken
    ) as TypedEventFetch
  })
})
