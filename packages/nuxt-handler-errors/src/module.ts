/**
 * The build-time wiring: where the emitter's string becomes a file the
 * compiler reads, and where the interface it augments is made resolvable
 * (SPEC.md §4.2, §4.5).
 *
 * Everything here is schedule and placement. The text itself is `./emit-map`'s
 * job and nothing below re-derives a byte of it (SPEC.md §4.6).
 */

import { addTypeTemplate, defineNuxtModule, updateTemplates } from '@nuxt/kit'
import type { Nitro } from 'nitropack/types'
import { emitMap, EMPTY_MAP, TYPES_SPECIFIER } from './emit-map'
import type { MethodKeyMode } from './emit-map'

export interface ModuleOptions {
  /**
   * How a route with no method-specific handler is keyed (SPEC.md §10.3).
   *
   * `presence` is the default and the shipped design: one `default` key, with
   * the fallback done at the type level on key presence, mirroring h3's
   * dispatcher. `expanded` is the documented fallback for the day the added
   * conditional depth tips a large app's compiler over — it moves the fallback
   * into the emitter, so consumption is a bare index with zero conditionals, at
   * the cost of a nine-fold expansion of every catch-all route.
   *
   * Exposed rather than hard-coded because the trigger condition is a property
   * of the *consumer's* app — the evidence for `presence` is one app with six
   * routes (SPEC.md §10.2) — and an escape hatch nobody can reach is not one.
   */
  methodKeys?: MethodKeyMode
}

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
  setup(options, nuxt) {
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
                  // Forwarded only when the consumer set it, so the default
                  // lives in exactly one place — `EmitMapOptions` — rather than
                  // being restated here and in a `defaults` block as well.
                  ...(options.methodKeys === undefined
                    ? {}
                    : { methodKeys: options.methodKeys }),
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
