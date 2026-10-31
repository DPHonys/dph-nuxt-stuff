import { defineNuxtPlugin } from '#app'
import { installBetterFetchGlobal } from '../../shared/better-fetch'

/**
 * `$betterFetch` on the browser's `globalThis`. Client-only: during
 * server-side rendering the one global is Nitro's, which the Nitro plugin
 * installs.
 */
export default defineNuxtPlugin(installBetterFetchGlobal)
