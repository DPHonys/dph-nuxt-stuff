import { logger } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'

// Call at setup, before Nuxt fills the empty slot with its own handler, so
// the entries seen are exactly the consumer's.
export function warnCustomErrorHandler(nuxt: Nuxt, name: string): void {
  if (nuxt.options.nitro.errorHandler === undefined) return

  logger.warn(
    `[${name}] A custom \`nitro.errorHandler\` is set. Known ` +
      'failures travel as `error.data` on ordinary HTTP errors - an error ' +
      'handler that does not serialize `data` silently drops every ' +
      'declared payload, and checked call sites will read those failures ' +
      'as unknown. Make sure your handler keeps `data` in the response body.'
  )
}
