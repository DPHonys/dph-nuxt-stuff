/**
 * The build-time wiring: where the emitter's string becomes a file the
 * compiler reads, and where the interface it augments is made resolvable
 * (SPEC.md §4.2, §4.5).
 *
 * Everything here is schedule and placement. The text itself is `./emit-map`'s
 * job and nothing below re-derives a byte of it (SPEC.md §4.6).
 */

import {
  addImports,
  addPlugin,
  addServerPlugin,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
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
 * **The directory is load-bearing, not a preference.** Nitro's `typesDir` is
 * `resolve(buildDir, 'types')` and Nuxt hands Nitro its own `buildDir`, so
 * emitting under `types/` is what makes the handler specifiers the emitter
 * computes — all of them relative to that directory — resolve at all. Written
 * anywhere else, every `import('…')` in the file points at nothing, and an
 * unresolved `import('…')` inside a `.d.ts` produces **no diagnostic**: the
 * entry silently becomes TypeScript's error type, which satisfies every
 * assertion made about it (SPEC.md §4.2; measured in
 * `test/types/emitted-map.test.ts`).
 */
const TEMPLATE_FILENAME = 'types/nuxt-handler-errors.d.ts'

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-handler-errors',
    configKey: 'handlerErrors',
    // The ceiling is load-bearing: `compatibility.nuxt` is checked at module
    // setup, before any dependency or type machinery matters, so it is the only
    // guard against the h3 v2 / Nitro 3 line. The floor is what was measured
    // (4.5.1) rather than what the scaffold assumed. See SPEC.md §7.1.
    compatibility: { nuxt: '>=4.5.0 <5.0.0' },
  },
  setup(_options, nuxt) {
    // Nuxt's hoist list puts a `paths` entry for the specifier into every
    // generated tsconfig, so the `declare module` block the emitter writes and
    // every consumer's `import type { TypedApiErrors }` name the same file.
    // Nuxt does exactly this for `nitropack/types`, and it is what makes
    // augmenting our own specifier — rather than squatting inside Nitro's —
    // affordable at all (SPEC.md §4.2). The string comes from the emitter so it
    // cannot drift from the one the emitted text actually declares.
    //
    // **SPEC.md §4.2 says the augmentation is inert without this, and that no
    // longer reproduces.** Measured against the playground: with the push
    // removed the `paths` entries vanish and both programs still compile clean,
    // because the module's published `exports` and `typesVersions` (ticket 01,
    // which the prototype §4.2 measured predates) already resolve
    // `…/types` to one file from every context in the app. The push stays: it
    // is the spec's fixed contract, `test/generated-map.test.ts` holds the
    // `paths` entries it produces, and the case it covers — a consumer where
    // the specifier does *not* resolve from the app root, such as a module
    // arriving through a Nuxt layer or a `moduleResolution` that ignores
    // `exports` — is exactly the one no test in this repo can reach.
    nuxt.options.typescript.hoist.push(TYPES_SPECIFIER)

    // The reader pair, auto-imported app-side (SPEC.md §3.7).
    //
    // **Sugar, and only sugar.** The contract is the hand-writable
    // `/shared` specifier, which resolves from the client, the server and a
    // consumer's `shared/` directory alike; this registers the same two names
    // in the app's auto-import scope so a `<script setup>` call site — the
    // composable's primary one — need not write the import.
    //
    // `from` is resolved against this module's own file rather than named as
    // the published specifier, so the auto-imported binding and the
    // hand-written one are the same module instance rather than two copies of
    // it.
    //
    // Deliberately app-side only. `addServerImports` would put
    // `useDeclaredError`, a Vue composable, into the Nitro auto-import scope
    // where it has no business being suggested, and a server call site is
    // already one hand-written import away from the value form.
    const resolver = createResolver(import.meta.url)
    const shared = resolver.resolve('./runtime/shared')

    addImports([
      { name: 'declaredError', from: shared },
      { name: 'useDeclaredError', from: shared },
    ])

    // The composable pair (SPEC.md §3.4), app-side only — it calls `useFetch`,
    // which lives behind `#app`, an alias the Nitro build does not have.
    //
    // **This registration is the whole contract for these two names**, which is
    // the one place SPEC.md §3.7's *"the hand-writable specifier is the
    // contract, auto-imports are sugar"* rule cannot be honoured: SPEC.md §3
    // publishes three specifiers, and none of them may carry an `#app` import.
    // A call site that wants the import written out reaches for Nuxt's own
    // `#imports`. See SPEC-AMENDMENTS item 29 and the file's own header.
    const composables = resolver.resolve('./runtime/app/use-typed-fetch')

    addImports([
      { name: 'useTypedFetch', from: composables },
      { name: 'useLazyTypedFetch', from: composables },
    ])

    // Vanilla `useFetch` gets a per-call-site key injected by Nuxt's compiler,
    // and that key is what keeps two components fetching the same URL from
    // sharing one `useAsyncData` entry. A wrapper is invisible to that
    // transform unless it says so here, so without these two lines
    // `useTypedFetch` would be *behaviourally* narrower than the composable it
    // mirrors — which is exactly what SPEC.md §6.1's degradation lock forbids,
    // one layer below the type level where the rest of it is enforced.
    //
    // `argumentLength: 3` is vanilla's own (`request`, `opts`-or-key, key), so
    // the key is appended only to calls that did not already name one.
    //
    // **Measured, against a real production build of the playground.** With a
    // second `useTypedFetch('/api/boom')` added beside the first, the SSR
    // payload carries **9** distinct `$f…` data keys with these two lines and
    // **7** without: the duplicate pair collapses onto one key, and so does the
    // `useTypedFetch`/`useLazyTypedFetch` pair on the same route, because
    // `useFetch`'s fallback key is hashed from the request and the option
    // segments alone. Not kept as a test — the observation is a count of keys
    // in Nuxt's payload format, which is not this module's contract.
    nuxt.options.optimization.keyedComposables.push(
      { name: 'useTypedFetch', source: composables, argumentLength: 3 },
      { name: 'useLazyTypedFetch', source: composables, argumentLength: 3 }
    )

    // `$typedFetch` (SPEC.md §3.5), installed on `globalThis` on both sides.
    //
    // **Not an auto-import, and that is the design.** SPEC.md §3.5 declares it
    // the way Nitro declares its own — `declare var $typedFetch: $TypedFetch`,
    // in `./runtime/types` — so a Nitro route file, a `<script setup>` block
    // and a consumer's `shared/` module all reach it with no import and **no
    // new entry point**, which is one of the ticket's criteria rather than a
    // convenience. The type reaches every program through the emitted map,
    // which imports `./runtime/types` and is referenced from all three
    // contexts; these two lines are what makes the value be there as well.
    //
    // Two plugins rather than one because there are two `globalThis`es to
    // attach to, and **the app half is `client`-only on purpose**: on the
    // server there is exactly one global and it is Nitro's, so an
    // all-modes app plugin would rewrite the same property on every SSR request
    // *and* mask the Nitro plugin's absence — with it, deleting
    // `addServerPlugin` below is a red test rather than an order-dependent
    // pass. The browser is the one place Nitro's plugin cannot reach, and that
    // is exactly what the client plugin is for.
    //
    // The wrapper reads `globalThis.$fetch` at *call* time, so neither plugin
    // depends on running after the thing it wraps — each is a single property
    // write.
    //
    // Deliberately **not** `event.$typedFetch` (SPEC.md §3.6), which is a
    // different type, forwards the request's cookies and context, and is
    // installed per request from a `request` hook — the plugin below.
    addPlugin({
      src: resolver.resolve('./runtime/app/typed-fetch.plugin'),
      mode: 'client',
    })
    addServerPlugin(resolver.resolve('./runtime/server/typed-fetch.plugin'))

    // `event.$typedFetch` (SPEC.md §3.6), installed per request.
    //
    // A second Nitro plugin rather than a second assignment inside the first,
    // because the two are different things installed at different times: the
    // global is one property write at plugin time over `globalThis.$fetch`,
    // and this one is a `request`-hook closure over the **event's own**
    // `$fetch` — which is what forwards the incoming request's cookies,
    // headers and context. Splitting them is also what makes each deletable on
    // its own, so each has a mutation that reddens its own tests and nothing
    // else.
    //
    // Server-side only, and there is no client half: `event` is a Nitro
    // concept, and the surface is typed onto h3's `H3Event` rather than onto
    // `globalThis`.
    addServerPlugin(
      resolver.resolve('./runtime/server/event-typed-fetch.plugin')
    )

    // Captured here and read by `getContents` (SPEC.md §4.2). Deliberately not
    // `useNitro()` / `nuxt._nitro` at render time: those answer whatever
    // instance is current, while the hook that forces the re-render belongs to
    // *this* one, and on a dev-server restart the two are not the same object.
    let nitro: Nitro | undefined

    // A type template rather than a direct write from `types:extend`, for the
    // three reasons SPEC.md §4.2 gives — and the second argument is what buys
    // two of them, so it is not boilerplate:
    //
    // - `nuxt: true` puts the file in the **app** program and, with it,
    //   `vite.vue.script.globalTypeFiles` — `<script setup>` is the composable's
    //   primary call site.
    // - `nitro: true` routes a reference through `nitro:prepare:types` into
    //   Nitro's own tsconfig, which is the **server** program SPEC.md §3.6's
    //   `event.$typedFetch` is consumed from.
    // - `shared: true` is the third context the published specifiers exist for
    //   (SPEC.md §3), and `$typedFetch` is documented as callable from it.
    //
    // **SPEC.md §4.2's snippet writes `{ nitro: true }` and that is wrong.**
    // `addTypeTemplate` adds the app reference under `!context || context.nuxt`
    // and `globalTypeFiles` under `!context || context.nuxt || context.shared`
    // (`@nuxt/kit dist/index.mjs:1986-1998`), so passing a context at all opts
    // *out* of everything it does not name. Measured: with `{ nitro: true }`
    // alone the reference lands only in `types/nitro-nuxt.d.ts`, and the app
    // and shared programs see the empty published interface — `TS2339` on every
    // route key, in `app.vue` first.
    addTypeTemplate(
      {
        filename: TEMPLATE_FILENAME,
        getContents: () =>
          nitro === undefined
            ? // Cold start: SPEC.md §4.2's third reason for a template. The
              // seed is the emitter's own file shell applied to no routes, so
              // it cannot drift from the map that replaces it.
              EMPTY_MAP
            : emitMap(
                // Nitro's own two arrays, in Nitro's own order (SPEC.md §4.2).
                [...nitro.scannedHandlers, ...nitro.options.handlers],
                {
                  // Passed **whole**. `resolveNitroPath` reads arbitrary
                  // properties off it to expand `{{ }}` path templates, so a
                  // hand-built object narrowed to the three properties the
                  // signature names would silently lose them.
                  nitroOptions: nitro.options,
                }
              ),
      },
      { nitro: true, nuxt: true, shared: true }
    )

    nuxt.hook('nitro:init', (instance) => {
      nitro = instance

      // The correctness anchor (SPEC.md §4.2). `types:extend` fires inside
      // Nitro's `writeTypes` immediately before it writes its own route types,
      // and is always preceded by a fresh `scanHandlers` — so the handlers read
      // above are the ones Nitro is about to key, and this map lands a beat
      // *ahead* of Nitro's rather than behind it. Nothing else has that
      // schedule: `nitro:config` is pre-`createNitro` and has no handlers,
      // `nitro:init` itself fires once per load, and Nuxt's `prepare:types`
      // fires once and explicitly skips route-type regeneration in dev.
      instance.hooks.hook('types:extend', async () => {
        await updateTemplates({
          filter: (template) => template.filename === TEMPLATE_FILENAME,
        })
      })
    })
  },
})
