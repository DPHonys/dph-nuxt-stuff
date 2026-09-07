import { configuredChannelToken } from '#nuxt-typed-handler/channel-token'
import type { RawEventFetch } from '@dphonys/nuxt-handler-errors/internals/server'
import { createCheckedEventFetch } from '@dphonys/nuxt-handler-errors/internals/server'
import { defineNitroPlugin } from 'nitropack/runtime'
import type { TypedEventFetch } from '../../types/fetch'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    event.$typedFetch = createCheckedEventFetch(
      () => event.$fetch as RawEventFetch<unknown> | undefined,
      configuredChannelToken
    ) as TypedEventFetch
  })
})
