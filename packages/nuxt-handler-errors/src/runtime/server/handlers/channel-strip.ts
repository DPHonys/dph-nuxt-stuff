// The error-handler chain entry as Nitro loads it — `src/module.ts` prepends
// this path to `nitro.options.errorHandler`, only when a token is configured.

import { configuredChannelToken } from '#nuxt-handler-errors/channel-token'
import { createChannelStripHandler } from '../lib/channel-strip'

export default createChannelStripHandler(() => configuredChannelToken)
