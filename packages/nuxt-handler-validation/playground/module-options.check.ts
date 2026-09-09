import type { NuxtConfig } from 'nuxt/schema'

/**
 * The module's config typing, asserted from a consumer's seat: the claims below
 * are about types Nuxt generates, so they only hold inside a real app whose
 * `.nuxt` was written by `nuxt prepare`. Run by `pnpm typecheck`.
 */

export const disabled: NuxtConfig['handlerValidation'] = false

/** The dev-only response check, turned off from a consumer's config. */
export const checkResponses: NuxtConfig['handlerValidation'] = {
  checkResponses: false,
}

export const strayKey: NuxtConfig['handlerValidation'] = {
  checkResponses: true,
  // @ts-expect-error a key this module does not declare must not type-check
  channelToken: 'x',
}

/** The array module form, which carries the options in a tuple position. */
export const arrayForm: NuxtConfig['modules'] = [
  ['@dphonys/nuxt-handler-validation', {}],
]
