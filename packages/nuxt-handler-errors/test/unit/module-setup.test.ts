import { loadNuxt, logger } from '@nuxt/kit'
import type { NuxtHooks, Nuxt, ResolvedNuxtTemplate } from '@nuxt/schema'
import type { Nitro } from 'nitropack/types'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const FIXTURE = fileURLToPath(new URL('../fixtures/basic', import.meta.url))

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
 * `loadNuxt` boot of the test fixture — because `nuxt prepare`'s output cannot
 * see registration at all (`keyedComposables` leaves no artifact in `.nuxt`).
 *
 * A hand-stubbed `nuxt` fed to `setup()` directly runs in a tenth of the time,
 * but its shape is dictated implicitly by whatever `@nuxt/kit` helpers the
 * module happens to call — a kit upgrade breaks the stub opaquely, and
 * asserting into an invented shape is exactly the internals-coupling this
 * suite's contracts-not-internals rule exists to keep out. The boot is shared:
 * one `beforeAll`, every wiring assertion reads from it.
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
      nuxt = await loadNuxt({ cwd: FIXTURE, ready: false })

      nuxt.hook('nitro:init', (instance) => {
        nitro = instance
      })

      await nuxt.ready()
    })
  }, 120_000)

  afterAll(async () => {
    await nuxt?.close()
  })

  it('registers all four wrappers as keyed, with vanilla’s argument length', () => {
    // Load-bearing: without these Nuxt's compiler injects no per-call-site key,
    // duplicate calls collapse onto one `useAsyncData` entry, and the wrappers
    // are *behaviourally* narrower than the vanilla composables they mirror —
    // the degradation lock failing one layer below the types.
    const entries = nuxt.options.optimization.keyedComposables.filter(
      ({ name }) => name.includes('Checked')
    )

    // `toEqual` over the whole filtered list, so a duplicate registration is a
    // failure too. `argumentLength: 3` is vanilla `useFetch`'s and
    // `useAsyncData`'s own: the key is appended only to calls that did not
    // already name one.
    expect(entries).toEqual([
      {
        name: 'useCheckedFetch',
        source: expect.stringMatching(
          /\/runtime\/app\/composables\/use-checked-fetch$/
        ),
        argumentLength: 3,
      },
      {
        name: 'useLazyCheckedFetch',
        source: expect.stringMatching(
          /\/runtime\/app\/composables\/use-checked-fetch$/
        ),
        argumentLength: 3,
      },
      {
        name: 'useCheckedAsyncData',
        source: expect.stringMatching(
          /\/runtime\/app\/composables\/use-checked-async-data$/
        ),
        argumentLength: 3,
      },
      {
        name: 'useLazyCheckedAsyncData',
        source: expect.stringMatching(
          /\/runtime\/app\/composables\/use-checked-async-data$/
        ),
        argumentLength: 3,
      },
    ])
  })

  it('auto-imports the five app composables and nothing from `shared`', async () => {
    // The registration is these composables' whole contract: every one of them
    // reaches `#app`, so none can sit on a published specifier. `matchError` is
    // deliberately absent — its callers are the server and a consumer's
    // `shared/` directory, where `/shared` is the only way in.
    //
    // Read through `imports:extend`, which is where `addImports` puts them:
    // the option array is not the registry.
    const collected: Parameters<NuxtHooks['imports:extend']>[0] = []
    await nuxt.callHook('imports:extend', collected)

    const names = collected
      .map((entry) => entry.name)
      .filter((name) => name.includes('Checked') || name === 'matchError')

    expect(names).toEqual([
      'useCheckedFetch',
      'useLazyCheckedFetch',
      'useCheckedAsyncData',
      'useLazyCheckedAsyncData',
      'useRequestCheckedFetch',
    ])
  })

  it('registers the app $checkedFetch plugin, client-only', () => {
    // The browser half of the global: one `addPlugin` whose `mode: 'client'` is
    // load-bearing — an all-modes app plugin writes the same one `globalThis`
    // during SSR and masks the Nitro plugin's deletion.
    const entries = nuxt.options.plugins.filter((plugin) =>
      /\/runtime\/app\/plugins\/checked-fetch\.client(?:\.\w+)?$/.test(
        typeof plugin === 'string' ? plugin : plugin.src
      )
    )

    // Length over the whole filtered list, so a duplicate registration is a
    // failure too. `toMatchObject` rather than `toEqual`, because kit stamps
    // each entry with a marker symbol that is its internals, not contract.
    expect(entries).toHaveLength(1)
    expect(entries).toMatchObject([{ mode: 'client' }])
  })

  it('registers the two Nitro plugins separately, so each is deletable', () => {
    // The split is the point: the global and the per-request `event.$checkedFetch`
    // are two plugins rather than two assignments in one, so a mutation to
    // either reddens its own tests and nothing else.
    // `?? ''` because Nitro's own option type admits a hole in the array.
    const registered = (nuxt.options.nitro.plugins ?? []).map(
      (plugin) => plugin ?? ''
    )

    expect(
      registered.filter((plugin) =>
        plugin.endsWith('/runtime/server/plugins/checked-fetch')
      )
    ).toHaveLength(1)
    expect(
      registered.filter((plugin) =>
        plugin.endsWith('/runtime/server/plugins/event-checked-fetch')
      )
    ).toHaveLength(1)
  })

  it('writes the channel token as a template, aliased into both builds', () => {
    // The token is a build-time module option, so it reaches the runtime the
    // build-time way: one written template, one alias, no runtime config. The
    // fixture configures nothing, and nothing means the **default tag** —
    // gating is on out of the box, so the stripper matches by value from the
    // first build rather than by mere header presence.
    const dst = nuxt.options.alias['#nuxt-handler-errors/channel-token']

    expect(dst).toMatch(/\/nuxt-handler-errors\/channel-token\.mjs$/)
    expect(nitro?.options.alias?.['#nuxt-handler-errors/channel-token']).toBe(
      dst
    )

    const template = nuxt.options.build.templates.find(
      (entry) => entry.filename === 'nuxt-handler-errors/channel-token.mjs'
    )

    // `write: true` is load-bearing: Nitro resolves the alias from disk, not
    // from Nuxt's virtual file system.
    expect(template?.write).toBe(true)
    expect(
      (template as { getContents?: () => string } | undefined)?.getContents?.()
    ).toBe('export const configuredChannelToken = "nuxt-handler-errors"\n')

    // And nothing rides `runtimeConfig` any more — the old route stays gone.
    expect(nuxt.options.runtimeConfig.public).not.toHaveProperty(
      'handlerErrors'
    )
  })

  it('prepends its stripper to the errorHandler chain, keeping Nuxt’s own', () => {
    // The measured seam: `nitro:config` fires after Nuxt has filled an empty
    // slot with its own handler and before `createNitro`, and the chain runs
    // in order with Nitro's builtin appended last. Read off the **resolved**
    // Nitro options rather than a hand-fed config object, so the assertion is
    // about the chain the app really gets — this module first, and Nuxt's
    // handler still in it. Present on a default boot, because the default tag
    // turns gating on.
    const chain = nitro?.options.errorHandler

    expect(Array.isArray(chain)).toBe(true)
    expect(chain?.[0]).toMatch(/\/runtime\/server\/handlers\/channel-strip/)
    expect(chain?.length).toBeGreaterThan(1)
  })

  it('registers no stripper when the token is set to the empty opt-out', async () => {
    // `''` is the one way to turn gating off, and build-time absence *is*
    // absence — an opted-out app can never grow a token at run time, so a
    // handler that could only ever return immediately stays out of the chain
    // entirely, and the template spells the constant as `undefined`.
    let optedOut: Nuxt | undefined
    let optedOutNitro: Nitro | undefined

    try {
      optedOut = await loadNuxt({
        cwd: FIXTURE,
        ready: false,
        overrides: { handlerErrors: { channelToken: '' } },
      })

      optedOut.hook('nitro:init', (instance) => {
        optedOutNitro = instance
      })

      await optedOut.ready()

      const chain = optedOutNitro?.options.errorHandler
      const entries = Array.isArray(chain) ? chain : [chain ?? '']

      expect(
        entries.filter((entry) => /channel-strip/.test(String(entry)))
      ).toEqual([])

      const template = optedOut.options.build.templates.find(
        (entry) => entry.filename === 'nuxt-handler-errors/channel-token.mjs'
      )

      expect(
        (
          template as { getContents?: () => string } | undefined
        )?.getContents?.()
      ).toBe('export const configuredChannelToken = undefined\n')
    } finally {
      await optedOut?.close()
    }
  }, 120_000)

  it('hoists the emitted specifier onto the generated tsconfigs', () => {
    // The string comes from the emitter so the push cannot drift from the
    // module the map actually augments.
    expect(nuxt.options.typescript.hoist).toContain(
      '@dphonys/nuxt-handler-errors/types'
    )
  })

  it('re-renders exactly the map template when this nitro’s types:extend fires', async () => {
    // The correctness anchor's deletion half: `types:extend` fires inside
    // Nitro's `writeTypes` after a fresh `scanHandlers`, and the module's
    // answer must be a re-render of the map template — on the *same* Nitro
    // instance whose `nitro:init` populated the closure, because on a
    // dev-server restart the current instance and the hooked one are not the
    // same object. `updateTemplates` is, publicly, one `builder:generateApp`
    // call carrying a template filter; recording that hook is how the
    // re-render is observed without a builder running.
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
    // The control for the warning below: the fixture does not override the
    // error handler, so a hit here means the detection misfires on every boot.
    expect(
      bootWarnings.filter((warning) => warning.includes('nitro.errorHandler'))
    ).toEqual([])
  })

  it('warns at setup when the project sets a custom nitro.errorHandler', async () => {
    // Nitro has a serializer that drops `data` entirely, and a project pointing
    // `errorHandler` at it — or at any handler that does not keep `data` —
    // silently loses every known payload with no compile-time signal. Setup can
    // only see the override, not what the handler does, so the warning fires on
    // the override itself.
    let overridden: Nuxt | undefined
    let overriddenNitro: Nitro | undefined

    const warnings = await warningsDuring(async () => {
      overridden = await loadNuxt({
        cwd: FIXTURE,
        ready: false,
        overrides: { nitro: { errorHandler: '~/server/error-handler' } },
      })

      overridden.hook('nitro:init', (instance) => {
        overriddenNitro = instance
      })

      await overridden.ready()
    })

    // The other half of the same boot: a consumer's entry is **preserved**
    // behind this module's, never replaced. Dropping it would silently
    // uninstall the handler the project asked for.
    // Three entries, in this order: this module's stripper, the consumer's own
    // handler, and Nitro's builtin — which `resolveErrorOptions` appends last
    // and which always terminates the chain.
    expect(overriddenNitro?.options.errorHandler).toEqual([
      expect.stringMatching(/\/runtime\/server\/handlers\/channel-strip/),
      '~/server/error-handler',
      expect.stringMatching(/nitropack\/dist\/runtime\/internal\/error\/prod$/),
    ])

    await overridden?.close()

    const hits = warnings.filter((warning) =>
      warning.includes('nitro.errorHandler')
    )

    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatch(/data/)
  }, 120_000)
})
