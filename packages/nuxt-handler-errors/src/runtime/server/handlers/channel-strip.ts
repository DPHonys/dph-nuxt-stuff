/**
 * The error-handler chain entry as Nitro loads it: `src/module.ts` prepends
 * this file's path to `nitro.options.errorHandler` at `nitro:config` — and
 * only when a token is configured, because the token is build-time and an
 * unconfigured app can never grow one at run time.
 *
 * Two lines, and that is deliberate — everything the entry *does* lives in
 * `../lib/channel-strip`, where it can be tested with nothing booted. The
 * token arrives as the build-time constant every other surface imports.
 */

import { configuredChannelToken } from '#nuxt-handler-errors/channel-token'
import { createChannelStripHandler } from '../lib/channel-strip'

export default createChannelStripHandler(() => configuredChannelToken)
