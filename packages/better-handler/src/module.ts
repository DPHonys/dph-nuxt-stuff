import {
  addImports,
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

/** One composable the app auto-imports, by name, from its file. */
interface Composable {
  readonly name: string
  /** Under `runtime/app/composables/`, without an extension. */
  readonly file: string
  /**
   * Whether the compiler appends a key to a call, as it does to `useFetch`'s
   * and `useAsyncData`'s: without it, two keyless calls of one composable
   * share an entry, and a keyless `useBetterAsyncData` has no key at all.
   */
  readonly keyed: boolean
}

// The one list both registrations read. The lazy twins are their own
// composables, each over Nuxt's own lazy twin.
const COMPOSABLES: readonly Composable[] = [
  { name: 'useBetterFetch', file: 'use-better-fetch', keyed: true },
  { name: 'useLazyBetterFetch', file: 'use-better-fetch', keyed: true },
  { name: 'useBetterAsyncData', file: 'use-better-async-data', keyed: true },
  {
    name: 'useLazyBetterAsyncData',
    file: 'use-better-async-data',
    keyed: true,
  },
  {
    name: 'useRequestBetterFetch',
    file: 'use-request-better-fetch',
    keyed: false,
  },
]

// Vanilla's own: a key is appended to a call passing fewer arguments than
// this, `(request, opts, key)` and `(key, handler, opts)` alike.
const KEYED_ARGUMENT_LENGTH = 3

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

    // App-side only: every composable reaches `#app`, which the Nitro build
    // does not have. `matchError` is not auto-imported, as an app's `shared/`
    // directory, where app auto-imports do not reach, is among its callers.
    const composables = COMPOSABLES.map((composable) => ({
      ...composable,
      from: resolver.resolve(`./runtime/app/composables/${composable.file}`),
    }))

    addImports(composables.map(({ name, from }) => ({ name, from })))

    nuxt.options.optimization.keyedComposables.push(
      ...composables
        .filter(({ keyed }) => keyed)
        .map(({ name, from }) => ({
          name,
          source: from,
          argumentLength: KEYED_ARGUMENT_LENGTH,
        }))
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
