import { configuredChannelToken } from '#nuxt-typed-handler/channel-token'
import { createChannelStripHandler } from '@dphonys/nuxt-handler-errors/internals/server'

export default createChannelStripHandler(() => configuredChannelToken)
