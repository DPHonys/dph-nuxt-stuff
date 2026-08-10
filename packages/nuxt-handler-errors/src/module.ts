/**
 * The build-time wiring: where the emitter's string becomes a file the
 * compiler reads, and where the interface it augments is made resolvable.
 * Everything here is schedule and placement — the text itself is
 * `./emit-map`'s job, and nothing below re-derives a byte of it.
 */

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

/**
 * The one option. Everything else is deliberate absence: every wrapper mirrors
 * its vanilla counterpart exactly, so there is nothing else to configure — and
 * an option is far cheaper to add later than to remove.
 */
export interface ModuleOptions {
  /**
   * The channel tag every checked surface attaches, and the value the
   * response-side stripper matches requests against — always by **value**,
   * never by mere header presence. **A channel tag, not a secret**: it is
   * compiled into the client bundle by design — the browser must send it
   * too — and it marks first-party intent; it authorises nothing.
   *
   * Defaults to `'nuxt-handler-errors'`, so gating is on out of the box:
   * checked calls carry the tag and everyone else gets the marker stripped.
   * Set your own value to name your app's channel, or `''` to turn gating off
   * entirely — nothing attached, nothing stripped.
   *
   * Build-time on purpose. The value is baked into both bundles at build, so
   * there is no env override and no runtime config to read — changing it is a
   * rebuild.
   */
  channelToken: string
}

/**
 * The out-of-the-box channel tag. A fixed, public string is exactly enough:
 * the token is not a secret on any value — it ships in the client bundle — so
 * a default buys the value-match against callers that never heard of this
 * module, and choosing your own buys nothing more than a distinct name.
 */
const DEFAULT_CHANNEL_TOKEN = 'nuxt-handler-errors'

/**
 * The specifier both builds import the configured token from. An alias rather
 * than a published entry, because the value only exists inside a build — the
 * module writes it as a template and points the app and Nitro builds at it.
 */
const CHANNEL_TOKEN_SPECIFIER = '#nuxt-handler-errors/channel-token'

/**
 * Where the map is written, relative to Nuxt's `buildDir`.
 *
 * The `types/` directory is load-bearing: Nitro's `typesDir` is
 * `resolve(buildDir, 'types')`, and every handler specifier the emitter
 * computes is relative to it. Written anywhere else, each `import('…')` in
 * the file points at nothing — and an unresolved `import('…')` in a `.d.ts`
 * produces **no diagnostic**: the entry silently becomes TypeScript's error
 * type, which satisfies every assertion made about it.
 */
const TEMPLATE_FILENAME = 'types/nuxt-handler-errors.d.ts'

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-handler-errors',
    configKey: 'handlerErrors',
    // The ceiling is the load-bearing half — it is the only guard against the
    // h3 v2 / Nitro 3 line. The floor is what was measured (4.5.1).
    compatibility: { nuxt: '>=4.5.1 <5.0.0' },
  },
  defaults: {
    channelToken: DEFAULT_CHANNEL_TOKEN,
  },
  setup(options, nuxt) {
    // Known failures ride `error.data` on the default error serializer; Nitro
    // has a serializer that drops `data` wholesale, and a custom
    // `errorHandler` pointing at it loses every declared payload with no
    // signal. Setup can see the override but not what the handler does, so
    // the warning fires on the override itself.
    //
    // Read here, at setup, deliberately: this module joins the chain itself at
    // `nitro:config`, and Nuxt fills the empty slot with its own handler before
    // that hook — so `nuxt.options.nitro.errorHandler` is the one place where
    // the entries are exactly the *consumer's* and nothing the framework or
    // this module added.
    if (nuxt.options.nitro.errorHandler !== undefined) {
      logger.warn(
        '[nuxt-handler-errors] A custom `nitro.errorHandler` is set. Known ' +
          'failures travel as `error.data` on ordinary HTTP errors — an error ' +
          'handler that does not serialize `data` silently drops every ' +
          'declared payload, and checked call sites will read those failures ' +
          'as unknown. Make sure your handler keeps `data` in the response body.'
      )
    }

    // A `paths` entry for the specifier in every generated tsconfig, as Nuxt
    // does for `nitropack/types`. The published `exports` already resolve it
    // everywhere this repo can measure; the push covers the one consumer no
    // test here reaches — a Nuxt layer, or a `moduleResolution` ignoring
    // `exports`. The string comes from the emitter so it cannot drift.
    nuxt.options.typescript.hoist.push(TYPES_SPECIFIER)

    // The app-side composables. `from` resolves against this module's own file
    // so every binding is one module instance, and none of them is registered
    // with `addServerImports`: all five reach `#app`, which the Nitro build
    // does not have. For the same reason none can sit on a published
    // specifier — this registration is their whole contract, and an explicit
    // import of any of them is `#imports`.
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

    // `matchError` is deliberately *not* auto-imported. Its callers are the
    // server and a consumer's `shared/` directory, where app-side auto-imports
    // do not reach and `/shared` is the only way in — and one function cannot
    // be in two import systems without the two disagreeing about which module
    // instance it came from.

    // A wrapper is invisible to Nuxt's per-call-site key injection unless
    // registered here — without these lines duplicate calls collapse onto one
    // `useAsyncData` entry (measured on the fetch pair: 9 distinct payload
    // keys with, 7 without). `argumentLength: 3` is vanilla's own, for
    // `useFetch` and `useAsyncData` alike.
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

    // `$checkedFetch` on both `globalThis`es. The app half is `client`-only on
    // purpose: during SSR the one global is Nitro's, and an all-modes app
    // plugin would mask the Nitro plugin's absence — with `client`, deleting
    // `addServerPlugin` below is a red test rather than an order-dependent
    // pass. The wrapper reads `globalThis.$fetch` at *call* time, so neither
    // plugin depends on running after the thing it wraps.
    addPlugin({
      src: resolver.resolve('./runtime/app/plugins/checked-fetch.client'),
      mode: 'client',
    })
    addServerPlugin(resolver.resolve('./runtime/server/plugins/checked-fetch'))

    // `event.$checkedFetch`, a per-request closure over the event's own
    // `$fetch`. A second plugin rather than a second assignment in the first,
    // so each is deletable on its own with a mutation that reddens its own
    // tests and nothing else.
    addServerPlugin(
      resolver.resolve('./runtime/server/plugins/event-checked-fetch')
    )

    // Channel gating. The token is build-time module configuration, so it
    // reaches the runtime the build-time way: normalised once here (`''` is
    // the explicit opt-out and reads as "no token"), written as a template,
    // and imported by every surface through one alias. There is no runtime
    // config involved — build-time absence *is* absence.
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

    // The stripping seam, exactly as measured: **prepend** to the array and
    // **preserve** every existing entry. `nitro:config` is the right line —
    // Nuxt fills the slot with its own handler only when it is empty and calls
    // this hook afterwards, so what is here is Nuxt's handler and/or a
    // consumer's, and the chain runs in order with the builtin appended last.
    // A single value is normalised here as Nitro would, so the prepend has one
    // code path.
    //
    // Prepended only when a token is configured: the token is build-time, so
    // an unconfigured app can never grow one at run time, and a handler that
    // could only ever return immediately has no business in its chain.
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

    // Captured here and read by `getContents`. Deliberately not `useNitro()`
    // at render time: on a dev-server restart the current instance and the
    // hooked one are not the same object.
    let nitro: Nitro | undefined

    // The second argument is what buys the template's reach — passing a
    // context at all opts *out* of everything it does not name (measured:
    // `{ nitro: true }` alone leaves the app and shared programs seeing the
    // empty published interface, a TS2339 on every route key). `nuxt` is the
    // app program and `<script setup>`, `nitro` the server program, `shared`
    // the third published context.
    addTypeTemplate(
      {
        filename: TEMPLATE_FILENAME,
        getContents: () =>
          nitro === undefined
            ? // Cold start: the seed is the emitter's own file shell applied
              // to no routes, so it cannot drift from the map that replaces it.
              EMPTY_MAP
            : emitMap(
                // Nitro's own two arrays, in Nitro's own order.
                [...nitro.scannedHandlers, ...nitro.options.handlers],
                {
                  // Passed **whole**. `resolveNitroPath` reads arbitrary
                  // properties off it to expand `{{ }}` path templates, so a
                  // hand-built three-property object would silently lose them.
                  nitroOptions: nitro.options,
                }
              ),
      },
      { nitro: true, nuxt: true, shared: true }
    )

    nuxt.hook('nitro:init', (instance) => {
      nitro = instance

      // The correctness anchor: `types:extend` fires inside Nitro's
      // `writeTypes` after a fresh `scanHandlers`, so this map lands a beat
      // *ahead* of Nitro's own route types. Nothing else has that schedule.
      instance.hooks.hook('types:extend', async () => {
        await updateTemplates({
          filter: (template) => template.filename === TEMPLATE_FILENAME,
        })
      })
    })
  },
})
