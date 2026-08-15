import type { NuxtConfig } from 'nuxt/schema'

/**
 * The module's config typing, asserted by the compiler from a consumer's seat.
 *
 * `ModuleOptions` is typed closed (`Record<string, never>`), which was reasoned
 * from the `@nuxt/kit`, `nuxt` and `@nuxt/module-builder` sources but never
 * compiled. Nuxt generates `handlerValidation?: Partial<ModuleOptions> | false`
 * into `NuxtConfig` from the module's own generic, so the claims below are
 * about generated types, not hand-written ones - which is why they are asserted
 * here, inside a real app whose `.nuxt` was written by `nuxt prepare`, and not
 * in the package's own type tier, where the augmentation does not exist.
 *
 * The fourth form, `handlerValidation: {}`, is written in `nuxt.config.ts`
 * itself, which is where a consumer writes it.
 *
 * Run by `pnpm typecheck` (`vue-tsc --project playground/tsconfig.json`).
 */

/**
 * The off-switch kit generates for any module that names a config key - the
 * reason `handlerValidation` exists at all for a module with no options.
 */
export const disabled: NuxtConfig['handlerValidation'] = false

/**
 * The stray key, rejected. `channelToken` is the sibling package's option name
 * and so the plausible mix-up this closed typing exists to catch; an open empty
 * options type would swallow it silently.
 */
export const strayKey: NuxtConfig['handlerValidation'] = {
  // @ts-expect-error a key this module does not declare must not type-check
  channelToken: 'x',
}

/** The array module form, which carries the options in a tuple position. */
export const arrayForm: NuxtConfig['modules'] = [
  ['@dphonys/nuxt-handler-validation', {}],
]
