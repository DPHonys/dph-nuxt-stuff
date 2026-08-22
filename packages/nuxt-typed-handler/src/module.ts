import {
  addChannelStripErrorHandler,
  addChannelToken,
  normalizeChannelToken,
  warnCustomErrorHandler,
} from '@dphonys/nuxt-handler-errors/internals/build'
import {
  addServerImports,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
  logger,
} from '@nuxt/kit'

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

/** The package this module replaces, and the key it used to be configured under. */
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
    // import `#app`, and Nuxt transpiles only what `modules` lists. The
    // validation parent's contract says push nothing.
    nuxt.options.build.transpile.push('@dphonys/nuxt-handler-errors')

    nuxt.options.typescript.hoist.push('@dphonys/nuxt-typed-handler/types')

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

    const channelToken = normalizeChannelToken(options.channelToken, NAME)
    addChannelToken(nuxt, NAME, channelToken)
    addChannelStripErrorHandler(
      nuxt,
      channelToken,
      resolver.resolve('./runtime/server/handlers/channel-strip')
    )

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
