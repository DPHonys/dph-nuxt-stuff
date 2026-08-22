import {
  addImports,
  addPlugin,
  addServerImports,
  addServerPlugin,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
  updateTemplates,
} from '@nuxt/kit'
import type { Nitro } from 'nitropack/types'
import { addChannelStripErrorHandler } from './build/channel-strip'
import { addChannelToken, normalizeChannelToken } from './build/channel-token'
import { warnCustomErrorHandler } from './build/error-handler-warning'
import { emitMap, EMPTY_MAP, TYPES_SPECIFIER } from './emit-map'

export interface ModuleOptions {
  /**
   * The channel tag every checked call attaches, and the value the
   * response-side stripper matches requests against. **A channel tag, not a
   * secret**: it ships in the client bundle by design and authorises nothing.
   *
   * Defaults to `'nuxt-handler-errors'`, so gating is on out of the box. Set
   * your own value to name your app's channel, or `false` to turn gating off
   * entirely. (`false`, not `null`: the options merge treats `null` as
   * "unset" and would silently restore the default.) Build-time: the value
   * is baked into both bundles, so changing it is a rebuild.
   */
  channelToken: string | false
}

// The one string the channel-token alias and template, the warning prefix,
// the default token and the map template derive from - the build helpers
// take it so another module layer composing them gets its own set.
const NAME = 'nuxt-handler-errors'

// Must live under `types/` - Nitro's `typesDir` - because every handler
// specifier the emitter computes is relative to it, and an unresolved
// `import('…')` in a `.d.ts` produces no diagnostic.
const TEMPLATE_FILENAME = `types/${NAME}.d.ts`

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: NAME,
    configKey: 'handlerErrors',
    // The ceiling is the only guard against the h3 v2 / Nitro 3 line.
    compatibility: { nuxt: '>=4.5.1 <5.0.0' },
  },
  defaults: {
    channelToken: NAME,
  },
  setup(options, nuxt) {
    warnCustomErrorHandler(nuxt, NAME)

    nuxt.options.typescript.hoist.push(TYPES_SPECIFIER)

    // None of the composables use `addServerImports`: all five reach `#app`,
    // which the Nitro build does not have.
    const resolver = createResolver(import.meta.url)
    const fetchComposables = resolver.resolve(
      './runtime/app/composables/use-checked-fetch'
    )
    const asyncDataComposables = resolver.resolve(
      './runtime/app/composables/use-checked-async-data'
    )
    const requestComposable = resolver.resolve(
      './runtime/app/composables/use-request-checked-fetch'
    )

    addImports([
      { name: 'useCheckedFetch', from: fetchComposables },
      { name: 'useLazyCheckedFetch', from: fetchComposables },
      { name: 'useCheckedAsyncData', from: asyncDataComposables },
      { name: 'useLazyCheckedAsyncData', from: asyncDataComposables },
      { name: 'useRequestCheckedFetch', from: requestComposable },
    ])

    // Same ambient position as `defineEventHandler`. `defineError` is the one
    // generic enough to collide, and today nothing in h3, Nitro, or Nuxt
    // claims it - the closest is `defineNitroErrorHandler`, a config helper.
    const errorHelpers = resolver.resolve('./runtime/server/lib/errors')
    addServerImports([
      { name: 'defineCheckedEventHandler', from: errorHelpers },
      { name: 'defineError', from: errorHelpers },
      { name: 'payload', from: errorHelpers },
      {
        name: 'recognizeKnownError',
        from: resolver.resolve('./runtime/server/lib/recognize-known-error'),
      },
    ])

    // `matchError` is deliberately not auto-imported: its callers include a
    // consumer's `shared/` directory, where app-side auto-imports do not reach.

    // Without this registration duplicate calls collapse onto one
    // `useAsyncData` entry. `argumentLength: 3` is vanilla's own.
    nuxt.options.optimization.keyedComposables.push(
      { name: 'useCheckedFetch', source: fetchComposables, argumentLength: 3 },
      {
        name: 'useLazyCheckedFetch',
        source: fetchComposables,
        argumentLength: 3,
      },
      {
        name: 'useCheckedAsyncData',
        source: asyncDataComposables,
        argumentLength: 3,
      },
      {
        name: 'useLazyCheckedAsyncData',
        source: asyncDataComposables,
        argumentLength: 3,
      }
    )

    // `$checkedFetch` on both `globalThis`es. The app half is `client`-only:
    // during SSR the one global is Nitro's.
    addPlugin({
      src: resolver.resolve('./runtime/app/plugins/checked-fetch.client'),
      mode: 'client',
    })
    addServerPlugin(resolver.resolve('./runtime/server/plugins/checked-fetch'))

    addServerPlugin(
      resolver.resolve('./runtime/server/plugins/event-checked-fetch')
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

    // The context must name all three programs: passing a context at all opts
    // out of everything it does not name.
    addTypeTemplate(
      {
        filename: TEMPLATE_FILENAME,
        getContents: () =>
          nitro === undefined
            ? EMPTY_MAP
            : emitMap([...nitro.scannedHandlers, ...nitro.options.handlers], {
                // Passed whole: `resolveNitroPath` reads arbitrary
                // properties off it to expand `{{ }}` path templates.
                nitroOptions: nitro.options,
              }),
      },
      { nitro: true, nuxt: true, shared: true }
    )

    nuxt.hook('nitro:init', (instance) => {
      nitro = instance

      // `types:extend` fires inside Nitro's `writeTypes` after a fresh
      // `scanHandlers`, so this map lands ahead of Nitro's own route types.
      instance.hooks.hook('types:extend', async () => {
        await updateTemplates({
          filter: (template) => template.filename === TEMPLATE_FILENAME,
        })
      })
    })
  },
})
