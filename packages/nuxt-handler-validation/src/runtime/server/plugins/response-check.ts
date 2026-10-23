import { setResponseChecking } from '../lib/response-check'

/**
 * Registered only when `checkResponses: false`, so the option needs no value to
 * travel into the bundle: the plugin's presence is the whole of the setting,
 * and a server that wants the check pays for no plugin at all.
 *
 * Nitro runs this when the app is created, ahead of every request, which is
 * what a lazily evaluated route file cannot be relied on to be.
 */
// A plain default export rather than `defineNitroPlugin`: that helper is an
// identity function, and reaching for it would make `nitropack` a runtime
// dependency of this package for nothing.
export default (): void => {
  setResponseChecking(false)
}
