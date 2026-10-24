/**
 * The Nitro plugin registration seam: the only code in the module that hands
 * Nitro a runtime plugin. On Nuxt 5 kit's `addServerPlugin` alias goes, and
 * only the body below changes.
 */

import { addServerPlugin } from '@nuxt/kit'

/** Register one runtime Nitro plugin, by its resolved path. */
export function addRuntimeServerPlugin(path: string): void {
  addServerPlugin(path)
}
