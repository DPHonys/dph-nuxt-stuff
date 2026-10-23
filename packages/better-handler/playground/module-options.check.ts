import type { NuxtConfig } from 'nuxt/schema'

/**
 * The module's config typing, asserted from a consumer's seat: the claims below
 * are about types Nuxt generates, so they only hold inside a real app whose
 * `.nuxt` was written by `nuxt prepare`. Run by `pnpm typecheck`.
 */

/** The development-only assertions, turned off from a consumer's config. */
export const devChecksOff: NuxtConfig['betterHandler'] = { devChecks: false }

/** The whole module, turned off: kit skips the setup of a `false` key. */
export const disabled: NuxtConfig['betterHandler'] = false

export const retiredOption: NuxtConfig['betterHandler'] = {
  devChecks: true,
  // @ts-expect-error the channel token no longer exists in this design
  channelToken: 'x',
}
