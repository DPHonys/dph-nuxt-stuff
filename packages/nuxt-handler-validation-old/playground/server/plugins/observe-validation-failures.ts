import { recognizeValidationError } from '@dphonys/nuxt-handler-validation-old/server'
import { observedErrors } from '~~/server/utils/observed-errors'

/**
 * The documented observability recipe, and the **explicit `/server` door** -
 * auto-imports reach a Nitro plugin too, but this is the import a test, a task
 * or a non-Nuxt Nitro consumer would write, so one of the two doors is proven
 * here and the other in the routes.
 *
 * Every error the hook sees is recorded, recognized or not: what this app can
 * then show is not only that a client's bad input is filterable, but that the
 * package's own developer errors are *not* - a hook doing
 * `if (recognizeValidationError(error)) return` still reports them.
 */
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('error', (error) => {
    const validation = recognizeValidationError(error)

    observedErrors.push({
      // Nitro types the hook's error as `Error`; the status is h3's own.
      statusCode: (error as { statusCode?: number }).statusCode,
      message: error.message,
      recognized: validation !== undefined,
      issues: validation?.issues ?? null,
    })
  })
})
