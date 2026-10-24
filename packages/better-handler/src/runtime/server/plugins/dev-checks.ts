import { setDevChecks } from '../dev-checks'

/**
 * Registered only when the app sets `devChecks: false`, so the option carries
 * no value into the bundle: the plugin's presence is the whole of the setting,
 * and a server that keeps the checks pays for no plugin at all.
 *
 * Nitro runs this when the app is created, ahead of every request, which a
 * lazily evaluated route file cannot be relied on to be.
 */
// A plain default export rather than `defineNitroPlugin`: that helper is an
// identity function, and importing it would make `nitropack/runtime` a
// runtime dependency of this package for nothing.
export default (): void => {
  setDevChecks(false)
}
