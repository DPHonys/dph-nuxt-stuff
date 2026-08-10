import {
  addImports,
  addPlugin,
  addServerPlugin,
  addTemplate,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
  logger,
  updateTemplates,
} from '@nuxt/kit'
import type { Nitro } from 'nitropack/types'
import { emitMap, EMPTY_MAP, TYPES_SPECIFIER } from './emit-map'

export interface ModuleOptions {
  /**
   * The channel tag every checked call attaches, and the value the
   * response-side stripper matches requests against. **A channel tag, not a
   * secret**: it ships in the client bundle by design and authorises nothing.
   *
   * Defaults to `'nuxt-handler-errors'`, so gating is on out of the box. Set
   * your own value to name your app's channel, or `''` to turn gating off
   * entirely. Build-time: the value is baked into both bundles, so changing
   * it is a rebuild.
   */
  channelToken: string
}

const DEFAULT_CHANNEL_TOKEN = 'nuxt-handler-errors'

// An alias rather than a published entry: the value only exists inside a
// build — the module writes it as a template and points both builds at it.
const CHANNEL_TOKEN_SPECIFIER = '#nuxt-handler-errors/channel-token'

// Must live under `types/` — Nitro's `typesDir` — because every handler
// specifier the emitter computes is relative to it, and an unresolved
// `import('…')` in a `.d.ts` produces no diagnostic.
const TEMPLATE_FILENAME = 'types/nuxt-handler-errors.d.ts'

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-handler-errors',
    configKey: 'handlerErrors',
    // The ceiling is the only guard against the h3 v2 / Nitro 3 line.
    compatibility: { nuxt: '>=4.5.1 <5.0.0' },
  },
  defaults: {
    channelToken: DEFAULT_CHANNEL_TOKEN,
  },
  setup(options, nuxt) {
    // Read at setup, before Nuxt fills the empty slot with its own handler,
    // so the entries here are exactly the consumer's.
    if (nuxt.options.nitro.errorHandler !== undefined) {
      logger.warn(
        '[nuxt-handler-errors] A custom `nitro.errorHandler` is set. Known ' +
          'failures travel as `error.data` on ordinary HTTP errors — an error ' +
          'handler that does not serialize `data` silently drops every ' +
          'declared payload, and checked call sites will read those failures ' +
          'as unknown. Make sure your handler keeps `data` in the response body.'
      )
    }

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

    // `''` is the explicit opt-out and reads as "no token".
    const channelToken =
      options.channelToken === '' ? undefined : options.channelToken

    // `write: true` is load-bearing: the Nitro build resolves the alias from
    // disk, not from Nuxt's virtual file system.
    const channelTokenTemplate = addTemplate({
      filename: 'nuxt-handler-errors/channel-token.mjs',
      write: true,
      getContents: () =>
        `export const configuredChannelToken = ${
          channelToken === undefined
            ? 'undefined'
            : JSON.stringify(channelToken)
        }\n`,
    })

    nuxt.options.alias[CHANNEL_TOKEN_SPECIFIER] = channelTokenTemplate.dst

    // The stripping seam: prepend to the error-handler array and preserve
    // every existing entry — the chain runs in order with the builtin last.
    nuxt.hook('nitro:config', (nitroConfig) => {
      // The Nitro half of the alias — `nuxt.options.alias` reaches the app
      // build only.
      nitroConfig.alias = {
        ...nitroConfig.alias,
        [CHANNEL_TOKEN_SPECIFIER]: channelTokenTemplate.dst,
      }

      if (channelToken === undefined) return

      const existing = nitroConfig.errorHandler
      const entries =
        existing === undefined
          ? []
          : Array.isArray(existing)
            ? existing
            : [existing]

      nitroConfig.errorHandler = [
        resolver.resolve('./runtime/server/handlers/channel-strip'),
        ...entries,
      ]
    })

    // Captured here and read by `getContents` — on a dev-server restart the
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
