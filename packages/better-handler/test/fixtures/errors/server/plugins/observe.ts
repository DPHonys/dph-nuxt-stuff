import { isError } from 'h3'
import { recognizeKnownError } from '../../../../../src/runtime/server'
import { observed } from '../utils/observed'

/** The one part of a Nitro app this plugin touches. */
interface ErrorHooks {
  readonly hooks: {
    hook: (name: 'error', listener: (error: Error) => void) => void
  }
}

/**
 * The observability recipe: an error hook reading the Tagged error off what
 * Nitro hands it, before any response is written.
 */
export default (nitroApp: ErrorHooks): void => {
  nitroApp.hooks.hook('error', (error) => {
    observed.push({
      tag: recognizeKnownError(error)?._tag,
      status: isError(error) ? error.statusCode : undefined,
    })
  })
}
