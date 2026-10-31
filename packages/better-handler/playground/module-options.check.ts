import type { NuxtConfig } from 'nuxt/schema'

/**
 * The module's config typing, asserted from a consumer's seat: the claims below
 * are about types Nuxt generates, so they only hold inside a real app whose
 * `.nuxt` was written by `nuxt prepare`. Run by `pnpm typecheck`.
 */

/** The development-only assertions, turned off from a consumer's config. */
export const devChecksOff: NuxtConfig['betterHandler'] = { devChecks: false }

/**
 * Any other key is refused: the earlier design's channel token option, which
 * this design retired, is no exception.
 */
export const anyOtherKey: NuxtConfig['betterHandler'] = {
  devChecks: true,
  // @ts-expect-error `devChecks` is the module's only option
  unknownOption: 'x',
}
