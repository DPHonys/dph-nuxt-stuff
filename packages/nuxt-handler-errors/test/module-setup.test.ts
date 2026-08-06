import { loadNuxt, logger } from '@nuxt/kit'
import type { Nuxt, ResolvedNuxtTemplate } from '@nuxt/schema'
import type { Nitro } from 'nitropack/types'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const PLAYGROUND = fileURLToPath(new URL('../playground', import.meta.url))

/**
 * Everything the kit logger warns while `run` executes.
 *
 * The reporter seam rather than a console spy, because the module warns
 * through `@nuxt/kit`'s consola instance and consola's default reporter
 * writes to stdout directly — a `console.warn` spy never sees it.
 */
async function warningsDuring(run: () => Promise<void>): Promise<string[]> {
  const captured: string[] = []
  const reporter = {
    log: (entry: { type: string; args: unknown[] }) => {
      if (entry.type === 'warn') captured.push(entry.args.map(String).join(' '))
    },
  }

  logger.addReporter(reporter)

  try {
    await run()
  } finally {
    logger.removeReporter(reporter)
  }

  return captured
}

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
  let bootWarnings: string[]

  beforeAll(async () => {
    // Booted in two steps rather than `ready: true`, because `nitro:init`
    // fires *during* `ready()` and the instance it hands over is the only
    // public route to the hooks the module registers on it.
    bootWarnings = await warningsDuring(async () => {
      nuxt = await loadNuxt({ cwd: PLAYGROUND, ready: false })

      nuxt.hook('nitro:init', (instance) => {
        nitro = instance
      })

      await nuxt.ready()
    })
  }, 60_000)

  afterAll(async () => {
    await nuxt?.close()
  })

  it('registers the composable pair as keyed, with vanilla’s argument length', () => {
    // The two `keyedComposables.push` lines are load-bearing:
    // without them Nuxt's compiler injects no per-call-site key, duplicate
    // fetches collapse onto one `useAsyncData` entry, and the wrapper is
    // *behaviourally* narrower than the `useFetch` it mirrors — the
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
        source: expect.stringMatching(
          /\/runtime\/app\/composables\/use-typed-fetch$/
        ),
        argumentLength: 3,
      },
      {
        name: 'useLazyTypedFetch',
        source: expect.stringMatching(
          /\/runtime\/app\/composables\/use-typed-fetch$/
        ),
        argumentLength: 3,
      },
    ])
  })

  it('registers the app $typedFetch plugin, client-only', () => {
    // The browser half of the global: one `addPlugin` whose
    // `mode: 'client'` is load-bearing and measured — an all-modes app plugin
    // writes the same one `globalThis` during SSR and masks the Nitro
    // plugin's deletion. The e2e suite already
    // reddens on losing `client`; this is what reddens on losing the
    // *registration*, which no browser runs in `pnpm check` to observe. What
    // the plugin's function body does is the unit test beside the double
    // (`typed-fetch.plugin.test.ts`); that Nuxt ships and executes a
    // registered client plugin in a real browser is upstream's contract and
    // deliberately not protected.
    const entries = nuxt.options.plugins.filter((plugin) =>
      /\/runtime\/app\/plugins\/typed-fetch\.client(?:\.\w+)?$/.test(
        typeof plugin === 'string' ? plugin : plugin.src
      )
    )

    // Length over the whole filtered list, so a duplicate registration is a
    // failure too. `toMatchObject` rather than `toEqual`, because kit stamps
    // each entry with a marker symbol that is its internals, not contract.
    expect(entries).toHaveLength(1)
    expect(entries).toMatchObject([{ mode: 'client' }])
  })

  it('re-renders exactly the map template when this nitro’s types:extend fires', async () => {
    // The correctness anchor's deletion half: `types:extend`
    // fires inside Nitro's `writeTypes` after a fresh `scanHandlers`, and the
    // module's answer must be a re-render of the map template — on the *same*
    // Nitro instance whose `nitro:init` populated the closure, because on a
    // dev-server restart the current instance and the hooked one are not the
    // same object. `updateTemplates` is, publicly, one `builder:generateApp`
    // call carrying a template filter; recording that hook is how the
    // re-render is observed without a builder running. The *other* half of
    // the README gap — an upstream bump making `types:extend` stop firing at
    // all — is observable only from a live dev server and stays with the
    // ungated `pnpm dev-race` diagnostic.
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

  it('does not warn about nitro.errorHandler when the project leaves it unset', () => {
    // The control for the warning below: the playground does not override the
    // error handler, so a hit here means the detection misfires on every boot.
    expect(
      bootWarnings.filter((warning) => warning.includes('nitro.errorHandler'))
    ).toEqual([])
  })

  it('warns at setup when the project sets a custom nitro.errorHandler', async () => {
    // Nitro has a serializer that drops `data` entirely, and a project
    // pointing `errorHandler` at it — or at any handler that does not keep
    // `data` — silently loses every declared payload with no compile-time
    // signal. Setup can only see the override, not what the handler does, so
    // the warning fires on the override itself.
    let overridden: Nuxt | undefined

    const warnings = await warningsDuring(async () => {
      overridden = await loadNuxt({
        cwd: PLAYGROUND,
        ready: true,
        overrides: { nitro: { errorHandler: '~/server/error-handler' } },
      })
    })

    await overridden?.close()

    const hits = warnings.filter((warning) =>
      warning.includes('nitro.errorHandler')
    )

    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatch(/declared/)
  }, 60_000)
})
