import {
  addChannelStripErrorHandler,
  addChannelToken,
  normalizeChannelToken,
  warnCustomErrorHandler,
} from '@dphonys/nuxt-handler-errors/internals/build'
import {
  addImports,
  addPlugin,
  addServerImports,
  addServerPlugin,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
  logger,
  updateTemplates,
} from '@nuxt/kit'
import type { Nitro } from 'nitropack/types'
import { typeMap, TYPES_SPECIFIER } from './build/type-map'

export interface ModuleOptions {
  /**
   * The channel tag every checked call attaches, and the value the
   * response-side stripper matches requests against. **A channel tag, not a
   * secret**: it ships in the client bundle by design and authorises nothing.
   *
   * Defaults to `'nuxt-typed-handler'`, so gating is on out of the box. Set
   * your own value to name your app's channel, or `false` to turn gating off
   * entirely. (`false`, not `null`: the options merge treats `null` as
   * "unset" and would silently restore the default.) Build-time: the value
   * is baked into both bundles, so changing it is a rebuild.
   */
  channelToken: string | false
}

const NAME = 'nuxt-typed-handler'

/** The one generated file: both maps, its cold-start seed, and where it lands. */
const TYPE_MAP = typeMap(NAME)

/** The two packages this module replaces, and the keys they were configured under. */
const PARENTS = [
  {
    packageName: '@dphonys/nuxt-handler-errors',
    moduleName: 'nuxt-handler-errors',
    configKey: 'handlerErrors',
  },
  {
    packageName: '@dphonys/nuxt-handler-validation',
    moduleName: 'nuxt-handler-validation',
    configKey: 'handlerValidation',
  },
] as const

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: NAME,
    configKey: 'typedHandler',
    // The ceiling is the only guard against the h3 v2 / Nitro 3 line.
    compatibility: { nuxt: '>=4.5.1 <5.0.0' },
  },
  defaults: {
    channelToken: NAME,
  },
  setup(options, nuxt) {
    warnCustomErrorHandler(nuxt, NAME)

    // A parent's key left behind configures nothing now: this module owns the
    // one option, under its own key. Own keys only, any value - `false` has
    // nothing left to switch off.
    for (const { configKey } of PARENTS) {
      if (!Object.hasOwn(nuxt.options, configKey)) continue

      logger.warn(
        `[${NAME}] \`${configKey}\` in nuxt.config is ignored: this module replaces the parent it configured. Move \`channelToken\` under \`typedHandler\` and delete \`${configKey}\`.`
      )
    }

    // Required by the errors parent's internals contract: its app internals
    // import `#app`, and Nuxt transpiles only what `modules` lists. Pushed
    // ahead of the typed fetch family that binds those internals, so the
    // contract holds from the first build. The validation parent's contract
    // says push nothing.
    nuxt.options.build.transpile.push('@dphonys/nuxt-handler-errors')

    // Only this module's own specifier is hoisted: `hoist` resolves from the
    // app's `modulesDir`, where an umbrella-only install has no parent.
    nuxt.options.typescript.hoist.push(TYPES_SPECIFIER)

    // Named explicitly rather than through `addServerImportsDir`, whose scan
    // would auto-import whatever the runtime tree happens to export. Neither
    // parent wrapper is among them: the umbrella's wrapper is the one door.
    const resolver = createResolver(import.meta.url)
    const serverEntry = resolver.resolve('./runtime/server/index')

    addServerImports(
      [
        'defineTypedEventHandler',
        'defineError',
        'payload',
        'recognizeKnownError',
        'recognizeValidationError',
      ].map((name) => ({ name, from: serverEntry }))
    )

    // None of the five uses `addServerImports`: every one reaches `#app`,
    // which the Nitro build does not have.
    const fetchComposables = resolver.resolve(
      './runtime/app/composables/use-typed-fetch'
    )
    const asyncDataComposables = resolver.resolve(
      './runtime/app/composables/use-typed-async-data'
    )
    const requestComposable = resolver.resolve(
      './runtime/app/composables/use-request-typed-fetch'
    )

    addImports([
      { name: 'useTypedFetch', from: fetchComposables },
      { name: 'useLazyTypedFetch', from: fetchComposables },
      { name: 'useTypedAsyncData', from: asyncDataComposables },
      { name: 'useLazyTypedAsyncData', from: asyncDataComposables },
      { name: 'useRequestTypedFetch', from: requestComposable },
    ])

    // `matchError` is deliberately not auto-imported: its callers include a
    // consumer's `shared/` directory, where app-side auto-imports do not reach.

    // Without this registration duplicate calls collapse onto one
    // `useAsyncData` entry. `argumentLength: 3` is vanilla's own.
    nuxt.options.optimization.keyedComposables.push(
      { name: 'useTypedFetch', source: fetchComposables, argumentLength: 3 },
      {
        name: 'useLazyTypedFetch',
        source: fetchComposables,
        argumentLength: 3,
      },
      {
        name: 'useTypedAsyncData',
        source: asyncDataComposables,
        argumentLength: 3,
      },
      {
        name: 'useLazyTypedAsyncData',
        source: asyncDataComposables,
        argumentLength: 3,
      }
    )

    // `$typedFetch` on both `globalThis`es. The app half is `client`-only:
    // during SSR the one global is Nitro's.
    addPlugin({
      src: resolver.resolve('./runtime/app/plugins/typed-fetch.client'),
      mode: 'client',
    })
    addServerPlugin(resolver.resolve('./runtime/server/plugins/typed-fetch'))

    addServerPlugin(
      resolver.resolve('./runtime/server/plugins/event-typed-fetch')
    )

    const channelToken = normalizeChannelToken(options.channelToken, NAME)
    addChannelToken(nuxt, NAME, channelToken)
    addChannelStripErrorHandler(
      nuxt,
      channelToken,
      resolver.resolve('./runtime/server/handlers/channel-strip')
    )

    // Captured here and read by `getContents` - on a dev-server restart the
    // current instance and the hooked one are not the same object.
    let nitro: Nitro | undefined

    // One file carrying both maps. The context must name all three programs:
    // passing a context at all opts out of everything it does not name.
    addTypeTemplate(
      {
        filename: TYPE_MAP.filename,
        getContents: () =>
          nitro === undefined
            ? TYPE_MAP.empty
            : TYPE_MAP.emit(
                [...nitro.scannedHandlers, ...nitro.options.handlers],
                // Passed whole: `resolveNitroPath` reads arbitrary
                // properties off it to expand `{{ }}` path templates.
                nitro.options
              ),
      },
      { nitro: true, nuxt: true, shared: true }
    )

    nuxt.hook('nitro:init', (instance) => {
      nitro = instance

      // `types:extend` fires inside Nitro's `writeTypes` after a fresh
      // `scanHandlers`, so this map lands ahead of Nitro's own route types.
      instance.hooks.hook('types:extend', async () => {
        await updateTemplates({
          filter: (template) => template.filename === TYPE_MAP.filename,
        })
      })
    })

    // Exclusive by construction: a project lists this module *or* the
    // parents. After every module has registered, a parent beside this one
    // is a configuration error, not a warning. Consumers list the package
    // name in `modules`; a module listed as a value is known to kit by its
    // `meta.name` alone, so both spellings are tried.
    nuxt.hook('modules:done', () => {
      for (const { packageName, moduleName } of PARENTS) {
        if (
          !hasNuxtModule(packageName, nuxt) &&
          !hasNuxtModule(moduleName, nuxt)
        ) {
          continue
        }

        throw new Error(
          `[${NAME}] \`${packageName}\` is also registered in \`modules\`. @dphonys/nuxt-typed-handler replaces it: remove \`${packageName}\` (and uninstall it), then move any \`channelToken\` under \`typedHandler\`.`
        )
      }
    })
  },
})
