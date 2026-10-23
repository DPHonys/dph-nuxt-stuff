import { defineNuxtModule } from '@nuxt/kit'

export interface ModuleOptions {
  /**
   * Whether a development server runs the three development-only assertions:
   * a response against the route's declared `output`, a thrown Known error's
   * fields against its declared schema, and a thrown `_tag` the route never
   * declared.
   *
   * Defaults to `true`. A production build never runs them and sends what the
   * Handler handed over either way.
   */
  devChecks: boolean
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'better-handler',
    configKey: 'betterHandler',
    // Every Nuxt 4, wider than the Scaffolder's catalog-derived floor on
    // purpose: every kit API this module uses exists in 4.0.0, and CI runs the
    // suites against 4.0.x as well as the latest 4.x to hold the claim. The
    // ceiling is the only guard against the h3 v2 / Nitro 3 line.
    compatibility: { nuxt: '>=4.0.0 <5.0.0' },
  },
  defaults: {
    devChecks: true,
  },
})
