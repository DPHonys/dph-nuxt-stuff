import { recognizeValidationError } from '@dphonys/nuxt-handler-validation/server'
import { isError } from 'h3'
import { observedErrors } from '~~/server/utils/observed-errors'

/** The documented observability recipe, through the explicit `/server` door. */
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('error', (error) => {
    const validation = recognizeValidationError(error)

    observedErrors.push({
      // Nitro types the hook's error as `Error`; the status is h3's own, read
      // through h3's own check for one of its errors.
      statusCode: isError(error) ? error.statusCode : undefined,
      message: error.message,
      recognized: validation !== undefined,
      issues: validation?.issues ?? null,
    })
  })
})
