import { loadNuxt, logger } from '@nuxt/kit'
import type {
  NuxtHooks,
  Nuxt,
  NuxtTemplate,
  ResolvedNuxtTemplate,
} from '@nuxt/schema'
import type { Nitro } from 'nitropack/types'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isString } from '../../src/runtime/shared/primitives'
import { renderTemplate } from '../template-data'

// A registered template with both resolved paths - what a generateApp
// filter is handed. Every template a booted Nuxt registers has them.
function isResolved(template: NuxtTemplate): template is ResolvedNuxtTemplate {
  return template.filename !== undefined && template.dst !== undefined
}

const FIXTURE = fileURLToPath(new URL('../fixtures/basic', import.meta.url))

/**
 * Everything the kit logger warns while `run` executes. The reporter seam
 * rather than a console spy: consola's default reporter writes to stdout
 * directly, so a `console.warn` spy never sees it.
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
 * What `setup()` registers, observed on a real `loadNuxt` boot of the fixture
 * `nuxt prepare`'s output cannot see registration (`keyedComposables`
 * leaves no artifact in `.nuxt`), and a hand-stubbed `nuxt` would couple the
 * suite to whatever kit helpers the module happens to call. One shared boot.
 */
describe('module setup wiring', () => {
  let nuxt: Nuxt
  let nitro: Nitro | undefined
  let bootWarnings: string[]

  beforeAll(async () => {
    // Two steps rather than `ready: true`: `nitro:init` fires *during*
    // `ready()`, and the instance it hands over is the only public route to
    // the hooks the module registers on it.
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
    // Without these Nuxt injects no per-call-site key and duplicate calls
    // collapse onto one `useAsyncData` entry.
    const entries = nuxt.options.optimization.keyedComposables.filter(
      ({ name }) => name.includes('Checked')
    )

    // `toEqual` over the whole filtered list, so a duplicate registration
    // fails too. `argumentLength: 3` is vanilla's own.
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
    // `matchError` is deliberately absent - `/shared` is its only way in.
    // Read through `imports:extend`, which is where `addImports` puts them.
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

  it('auto-imports the four server helpers into the Nitro build', () => {
    // Read off the *resolved* Nitro options - `addServerImports` only queues
    // onto `nitro:config`, so nothing is observable on `nuxt.options`.
    const imports = nitro?.options.imports
    const entries = (imports === false ? [] : (imports?.imports ?? [])).filter(
      (entry) => /nuxt-handler-errors/.test(entry.from)
    )

    // `toEqual` over the whole filtered list, so a duplicate registration
    // fails too.
    expect(entries).toEqual([
      {
        name: 'defineCheckedEventHandler',
        as: 'defineCheckedEventHandler',
        from: expect.stringMatching(/\/runtime\/server\/lib\/errors$/),
      },
      {
        name: 'defineError',
        as: 'defineError',
        from: expect.stringMatching(/\/runtime\/server\/lib\/errors$/),
      },
      {
        name: 'recognizeKnownError',
        as: 'recognizeKnownError',
        from: expect.stringMatching(
          /\/runtime\/server\/lib\/recognize-known-error$/
        ),
      },
    ])
  })

  it('registers the app $checkedFetch plugin, client-only', () => {
    // `mode: 'client'` is load-bearing - an all-modes app plugin writes the
    // same `globalThis` during SSR and masks the Nitro plugin's deletion.
    const entries = nuxt.options.plugins.filter((plugin) =>
      /\/runtime\/app\/plugins\/checked-fetch\.client(?:\.\w+)?$/.test(
        isString(plugin) ? plugin : plugin.src
      )
    )

    // `toMatchObject` because kit stamps each entry with a marker symbol.
    expect(entries).toHaveLength(1)
    expect(entries).toMatchObject([{ mode: 'client' }])
  })

  it('registers the two Nitro plugins separately, so each is deletable', () => {
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

  it('writes the channel token as a template, aliased into both builds', async () => {
    // One written template, one alias, no runtime config. The fixture
    // configures nothing, and nothing means the default tag - gating is on
    // out of the box.
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
    await expect(
      renderTemplate(nuxt, 'nuxt-handler-errors/channel-token.mjs')
    ).resolves.toBe(
      'export const configuredChannelToken = "nuxt-handler-errors"\n'
    )

    expect(nuxt.options.runtimeConfig.public).not.toHaveProperty(
      'handlerErrors'
    )
  })

  it('prepends its stripper to the errorHandler chain, keeping Nuxt’s own', () => {
    // Read off the *resolved* Nitro options, so the assertion is about the
    // chain the app really gets - this module first, Nuxt's handler still in.
    const chain = nitro?.options.errorHandler

    expect(Array.isArray(chain)).toBe(true)
    expect(chain?.[0]).toMatch(/\/runtime\/server\/handlers\/channel-strip/)
    expect(chain?.length).toBeGreaterThan(1)
  })

  it('registers no stripper when the token is set to the `false` opt-out', async () => {
    // `false` turns gating off, and build-time absence is absence: a handler
    // that could only ever return immediately stays out of the chain, and the
    // template spells the constant as `undefined`.
    let optedOut: Nuxt | undefined
    let optedOutNitro: Nitro | undefined

    try {
      optedOut = await loadNuxt({
        cwd: FIXTURE,
        ready: false,
        overrides: { handlerErrors: { channelToken: false } },
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

      await expect(
        renderTemplate(optedOut, 'nuxt-handler-errors/channel-token.mjs')
      ).resolves.toBe('export const configuredChannelToken = undefined\n')
    } finally {
      await optedOut?.close()
    }
  }, 120_000)

  it('warns when the token is an empty string, and still disables gating', async () => {
    // `''` disables gating like `false` does, but only `false` can mean it on
    // purpose: an empty string is how an unset env var interpolated into the
    // config would silently ship without gating, so it warns.
    let emptied: Nuxt | undefined
    let emptiedNitro: Nitro | undefined

    try {
      const warnings = await warningsDuring(async () => {
        emptied = await loadNuxt({
          cwd: FIXTURE,
          ready: false,
          overrides: { handlerErrors: { channelToken: '' } },
        })

        emptied.hook('nitro:init', (instance) => {
          emptiedNitro = instance
        })

        await emptied.ready()
      })

      expect(
        warnings.filter((entry) => /channelToken.*empty string/.test(entry))
      ).toHaveLength(1)

      const chain = emptiedNitro?.options.errorHandler
      const entries = Array.isArray(chain) ? chain : [chain ?? '']

      expect(
        entries.filter((entry) => /channel-strip/.test(String(entry)))
      ).toEqual([])
    } finally {
      await emptied?.close()
    }
  }, 120_000)

  it('hoists the emitted specifier onto the generated tsconfigs', () => {
    expect(nuxt.options.typescript.hoist).toContain(
      '@dphonys/nuxt-handler-errors/types'
    )
  })

  it('re-renders exactly the map template when this nitro’s types:extend fires', async () => {
    // `types:extend` fires inside Nitro's `writeTypes` after a fresh
    // `scanHandlers`. The re-render must target the *same* Nitro instance the
    // closure was populated from - on a dev-server restart the current and
    // hooked instances differ. `updateTemplates` is, publicly, one
    // `builder:generateApp` call carrying a template filter.
    const renders: { filter?: (template: ResolvedNuxtTemplate) => boolean }[] =
      []

    nuxt.hook('builder:generateApp', (options) => {
      renders.push(options ?? {})
    })

    await nitro?.hooks.callHook('types:extend', { routes: {} })

    // Exactly one: a duplicate hook registration re-renders every template
    // twice per route change.
    expect(renders).toHaveLength(1)

    // The filter selects the map template and nothing else, quantified over
    // the boot's real template registry.
    const selected = nuxt.options.build.templates
      .filter(isResolved)
      .filter((template) => renders[0]?.filter?.(template) ?? false)
      .map((template) => template.filename)

    expect(selected).toEqual(['types/nuxt-handler-errors.d.ts'])
  })

  it('does not warn about nitro.errorHandler when the project leaves it unset', () => {
    // The control for the warning below: a hit here means the detection
    // misfires on every boot.
    expect(
      bootWarnings.filter((warning) => warning.includes('nitro.errorHandler'))
    ).toEqual([])
  })

  it('warns at setup when the project sets a custom nitro.errorHandler', async () => {
    // A handler that does not keep `data` silently loses every known payload.
    // Setup can only see the override, not what the handler does, so the
    // warning fires on the override itself.
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

    // The consumer's entry is preserved behind this module's, never replaced:
    // stripper, consumer handler, then Nitro's builtin appended last.
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
