import { installBetterFetchGlobal } from '../../shared/better-fetch'
import { registerEventBetterFetch } from '../event-better-fetch'
import type { RequestHookHost } from '../event-better-fetch'

/**
 * The fetch family on the server: `$betterFetch` on Nitro's `globalThis`,
 * which server-side rendering shares, and `event.$betterFetch` on every
 * event, the ones a cached handler runs on included.
 */
// A plain default export rather than `defineNitroPlugin`: that helper is an
// identity function, and importing it would make `nitropack/runtime` a
// runtime dependency of this package for nothing.
export default (nitroApp: RequestHookHost): void => {
  installBetterFetchGlobal()
  registerEventBetterFetch(nitroApp)
}
