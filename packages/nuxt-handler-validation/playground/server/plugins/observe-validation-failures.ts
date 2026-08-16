import { recognizeValidationError } from '@dphonys/nuxt-handler-validation/server'
import { observedErrors } from '~~/server/utils/observed-errors'

/** The documented observability recipe, through the explicit `/server` door. */
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
