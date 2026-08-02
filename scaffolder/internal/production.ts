import { createTemplateRegistry } from './registry'
import { createScaffolder, productionNonce } from './scaffolder'
import type { Scaffolder } from './types'

/**
 * Ticket 08 establishes the transaction seam. The production Nuxt Template
 * and Clack interaction are connected by tickets 09 and 10 respectively.
 */
export function createProductionScaffolder(): Scaffolder {
  return createScaffolder({
    registry: createTemplateRegistry([]),
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
