// `recognizeKnownError` arrives by auto-import, like `defineNitroPlugin` below.
import { observedFailures } from '~~/server/utils/observed-failures'

/**
 * The documented observability recipe. `captureError` fires this hook before
 * the error-handler chain runs, so response-side stripping is invisible here
 * and `unhandled === false` is what separates a route's own declared failure
 * from an escaped callee's, which is the caller bug it looks like.
 */
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('error', (error) => {
    const variant = recognizeKnownError(error)

    if (variant === undefined) return

    observedFailures.push({
      tag: variant.tag,
      status: variant.status,
      // Nitro types the hook's error as `Error`; `unhandled` is h3's own flag,
      // read through h3's own guard.
      unhandled: isError(error) && error.unhandled,
    })
  })
})
