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
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
  logger,
  updateTemplates,
} from '@nuxt/kit'
import type { Nitro } from 'nitropack/types'
import { emitMap, EMPTY_MAP, TYPES_SPECIFIER } from './emit-map'

/**
 * The module has no options. Deliberate: every wrapper mirrors its vanilla
 * counterpart exactly, so there is nothing to configure — and an option is far
 * cheaper to add later than to remove.
 */
export interface ModuleOptions {}

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
  setup(_options, nuxt) {
    // Known failures ride `error.data` on the default error serializer; Nitro
    // has a serializer that drops `data` wholesale, and a custom
    // `errorHandler` pointing at it loses every declared payload with no
    // signal. Setup can see the override but not what the handler does, so
    // the warning fires on the override itself.
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
