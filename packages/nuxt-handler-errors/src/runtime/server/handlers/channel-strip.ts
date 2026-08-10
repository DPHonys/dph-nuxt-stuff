import { configuredChannelToken } from '#nuxt-handler-errors/channel-token'
import { createChannelStripHandler } from '../lib/channel-strip'

export default createChannelStripHandler(() => configuredChannelToken)
