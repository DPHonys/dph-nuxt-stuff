/**
 * The error-handler chain entry as Nitro loads it: `src/module.ts` prepends
 * this file's path to `nitro.options.errorHandler` at `nitro:config`, and the
 * generated chain imports it.
 *
 * Two lines, and that is deliberate — everything the entry *does* lives in
 * `../lib/channel-strip`, where it can be tested with nothing booted. This file
 * is the one place that reads `runtimeConfig`, per request (`useRuntimeConfig`
 * takes the event so a platform-provided config still applies).
 *
 * Registered unconditionally, even with no token configured: `runtimeConfig`
 * values are env-overridable at *run* time, so build-time absence is not
 * absence. With no token the handler returns immediately and the chain is
 * exactly what it would have been.
 */

import { useRuntimeConfig } from 'nitropack/runtime'
import { readChannelToken } from '../../shared/channel'
import { createChannelStripHandler } from '../lib/channel-strip'

export default createChannelStripHandler((event) =>
  readChannelToken(useRuntimeConfig(event))
)
