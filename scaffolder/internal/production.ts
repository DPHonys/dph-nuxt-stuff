import { createProductionTemplateRegistry } from './nuxt-module'
import { createScaffolder, productionNonce } from './scaffolder'
import type { Scaffolder } from './types'

/**
 * Ticket 10 connects the production interaction and post-commit adapters.
 */
export function createProductionScaffolder(): Scaffolder {
  return createScaffolder({
    registry: createProductionTemplateRegistry(),
    interaction: {
      async request() {
        return { status: 'cancelled' }
      },
    },
    installer: {
      async install() {
        throw new Error('The production installer is not connected yet')
      },
    },
    formatter: {
      async format() {
        throw new Error('The production formatter is not connected yet')
      },
    },
    now: () => new Date(),
    nonce: productionNonce,
  })
}
