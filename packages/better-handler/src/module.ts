import {
  addPlugin,
  addServerImports,
  createResolver,
  defineNuxtModule,
} from '@nuxt/kit'
import { BETTER_HANDLER_MAP, emitMap } from './build/emit-map'
import { addRouteTypeTemplate } from './build/routes'
import { addRuntimeServerPlugin } from './build/server-plugins'

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
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)

    // By name from the `/server` entry, never a directory scan, which would
    // widen an app's ambient surface whenever a runtime file is added.
    const serverEntry = resolver.resolve('./runtime/server/index')

    addServerImports(
      ['defineBetterEventHandler', 'defineError', 'recognizeKnownError'].map(
        (name) => ({ name, from: serverEntry })
      )
    )

    // `$betterFetch` on both sides' `globalThis`, and `event.$betterFetch` on
    // every request. The app half is client-only: during server-side
    // rendering the one global is Nitro's.
    addPlugin({
      src: resolver.resolve('./runtime/app/plugins/better-fetch.client'),
      mode: 'client',
    })
    addRuntimeServerPlugin(
      resolver.resolve('./runtime/server/plugins/better-fetch')
    )

    // Registered only to turn the checks off: the option carries no value
    // into the bundle, so the plugin's presence is the whole of the setting.
    if (!options.devChecks) {
      addRuntimeServerPlugin(
        resolver.resolve('./runtime/server/plugins/dev-checks')
      )
    }

    // The generated type map, `KnownApiErrors` and `KnownApiRequestInputs`
    // in one file. It augments this package's own `/types`, which the
    // package's `exports` resolves from every generated tsconfig, so nothing
    // is hoisted.
    addRouteTypeTemplate(nuxt, (routes) => emitMap(routes, BETTER_HANDLER_MAP))
  },
})
