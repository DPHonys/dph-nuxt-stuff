import { loadNuxt } from '@nuxt/kit'
import type { Nuxt, ResolvedNuxtTemplate } from '@nuxt/schema'
import type { Nitro } from 'nitropack/types'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Structural module-wiring: what `setup()` *registers*, observed on a real
 * `loadNuxt` boot of the playground — layer 3's fixture without its build
 * mode, because `nuxt prepare`'s output cannot see registration at all
 * (`keyedComposables` leaves no artifact in `.nuxt`; measured).
 *
 * A hand-stubbed `nuxt` fed to `setup()` directly runs in a tenth of the
 * time, but its shape is dictated implicitly by whatever `@nuxt/kit` helpers
 * the module happens to call — a kit upgrade breaks the stub opaquely, and
 * asserting into an invented shape is exactly the internals-coupling the
 * suite's contracts-not-internals rule exists to keep out. The boot is
 * shared: one `beforeAll`, every wiring assertion reads from it.
 *
 * Like the rest of the suite, this consumes the module through its real
 * published entry (`dist/module.mjs` via the playground), so a red here means
 * the *shipped* wiring regressed, not the sources.
 */
describe('module setup wiring', () => {
  let nuxt: Nuxt
  let nitro: Nitro | undefined

  beforeAll(async () => {
    // Booted in two steps rather than `ready: true`, because `nitro:init`
    // fires *during* `ready()` and the instance it hands over is the only
    // public route to the hooks the module registers on it.
    nuxt = await loadNuxt({
      cwd: fileURLToPath(new URL('../playground', import.meta.url)),
      ready: false,
    })

    nuxt.hook('nitro:init', (instance) => {
      nitro = instance
    })

    await nuxt.ready()
  }, 60_000)

  afterAll(async () => {
    await nuxt?.close()
  })

  it('registers the composable pair as keyed, with vanilla’s argument length', () => {
    // The two `keyedComposables.push` lines are load-bearing (SPEC.md §3.4):
    // without them Nuxt's compiler injects no per-call-site key, duplicate
    // fetches collapse onto one `useAsyncData` entry, and the wrapper is
    // *behaviourally* narrower than the `useFetch` it mirrors — §6.1's
    // degradation lock failing one layer below the types. The SSR
    // payload-count observation that measured that (9 vs 7 data keys) stays
    // untested — it counts keys in Nuxt's payload format, not this module's
    // contract — but the registration it measured is contract, and is what
    // this asserts.
    const entries = nuxt.options.optimization.keyedComposables.filter(
      ({ name }) => name === 'useTypedFetch' || name === 'useLazyTypedFetch'
    )

    // `toEqual` over the whole filtered list, so a duplicate registration is
    // a failure too. `argumentLength: 3` is vanilla `useFetch`'s own
    // (`request`, `opts`-or-key, key): the key is appended only to calls that
    // did not already name one.
    expect(entries).toEqual([
      {
        name: 'useTypedFetch',
        source: expect.stringMatching(/\/runtime\/app\/use-typed-fetch$/),
        argumentLength: 3,
      },
      {
        name: 'useLazyTypedFetch',
        source: expect.stringMatching(/\/runtime\/app\/use-typed-fetch$/),
        argumentLength: 3,
      },
    ])
  })

  it('re-renders exactly the map template when this nitro’s types:extend fires', async () => {
    // The correctness anchor's deletion half (SPEC.md §4.2): `types:extend`
    // fires inside Nitro's `writeTypes` after a fresh `scanHandlers`, and the
    // module's answer must be a re-render of the map template — on the *same*
    // Nitro instance whose `nitro:init` populated the closure, because on a
    // dev-server restart the current instance and the hooked one are not the
    // same object. `updateTemplates` is, publicly, one `builder:generateApp`
    // call carrying a template filter; recording that hook is how the
    // re-render is observed without a builder running. The *other* half of
    // the README gap — an upstream bump making `types:extend` stop firing at
    // all — is observable only from a live dev server and stays with the
    // ungated `pnpm dev-race` diagnostic (SPEC.md §9.6).
    const renders: { filter?: (template: ResolvedNuxtTemplate) => boolean }[] =
      []

    nuxt.hook('builder:generateApp', (options) => {
      renders.push(options ?? {})
    })

    await nitro?.hooks.callHook('types:extend', { routes: {} })

    // Exactly one render request: a duplicate hook registration re-renders
    // every template twice per route change, and is a failure too.
    expect(renders).toHaveLength(1)

    // The filter selects the map template and nothing else — asserted against
    // the boot's real template registry, so “exactly” quantifies over every
    // template actually registered, not an invented sample.
    const selected = nuxt.options.build.templates
      .filter(
        (template) =>
          renders[0]?.filter?.(template as ResolvedNuxtTemplate) ?? false
      )
      .map((template) => template.filename)

    expect(selected).toEqual(['types/nuxt-handler-errors.d.ts'])
  })
})
