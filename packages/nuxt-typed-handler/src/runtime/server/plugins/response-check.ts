import { setResponseChecking } from '@dphonys/nuxt-handler-validation/internals/server'
import { defineNitroPlugin } from 'nitropack/runtime'

/**
 * Registered only when `checkResponses: false`, so the option needs no value to
 * travel into the bundle: the plugin's presence is the whole of the setting.
 * The flag it clears is the validation parent's own, the same one this
 * module's wrapper reads through the parent's internals.
 */
export default defineNitroPlugin(() => {
  setResponseChecking(false)
})
