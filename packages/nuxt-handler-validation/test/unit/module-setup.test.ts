import { loadNuxt } from '@nuxt/kit'
import type { NuxtConfig, NuxtHooks, Nuxt } from '@nuxt/schema'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const FIXTURE = fileURLToPath(new URL('../fixtures/basic', import.meta.url))

/**
 * Anything registered *by this module* points into its own runtime tree, so
 * one pattern separates its registrations from Nuxt's and Nitro's own.
 */
const FROM_THIS_PACKAGE = /nuxt-handler-validation\/src\/runtime\//

/** Nitro's own instance type, without a dependency on `nitropack` for it. */
type NitroInstance = Parameters<NuxtHooks['nitro:init']>[0]

interface Booted {
  nuxt: Nuxt
  nitro: NitroInstance | undefined
}

/**
 * A real `loadNuxt` boot of the fixture app, in two steps rather than
 * `ready: true`: `nitro:init` fires *during* `ready()`, and the instance it
 * hands over is the only public route to the resolved Nitro options -
 * `addServerImports` merely queues onto `nitro:config`, so nothing it
 * registers is observable on `nuxt.options`.
 *
 * A real boot rather than a hand-stubbed `nuxt`, for the sibling's reason: a
 * stub would couple this suite to whichever kit helper the module happens to
 * call, and what is asserted here is what the module *registered*, not how.
 */
async function boot(overrides?: NuxtConfig): Promise<Booted> {
  const nuxt = await loadNuxt({ cwd: FIXTURE, ready: false, overrides })
  let nitro: NitroInstance | undefined

  nuxt.hook('nitro:init', (instance) => {
    nitro = instance
  })

  await nuxt.ready()

  return { nuxt, nitro }
}

/**
 * Everything this module put into the app, in one shape - so "it registered
 * exactly this" and "it registered nothing at all" are the same assertion made
 * against different values.
 */
function registrationsOf({ nuxt, nitro }: Booted) {
  const imports = nitro?.options.imports
  const resolved = imports === false ? undefined : imports

  return {
    // Auto-imports, read off the *resolved* Nitro options.
    serverImports: (resolved?.imports ?? []).filter((entry) =>
      FROM_THIS_PACKAGE.test(entry.from)
    ),

    // Directories handed to Nitro to scan. A dir entry is a path or a
    // `{ glob }`, so both are read as their pattern.
    serverImportDirs: (resolved?.dirs ?? [])
      .map((dir) => (typeof dir === 'string' ? dir : dir.glob))
      .filter((dir) => FROM_THIS_PACKAGE.test(dir)),

    appPlugins: nuxt.options.plugins.filter((plugin) =>
      FROM_THIS_PACKAGE.test(typeof plugin === 'string' ? plugin : plugin.src)
    ),

    // `?? ''` because Nitro's own option type admits a hole in the array.
    nitroPlugins: (nuxt.options.nitro.plugins ?? []).filter((plugin) =>
      FROM_THIS_PACKAGE.test(plugin ?? '')
    ),

    // Templates are named, not pathed, so they are matched on the filename
    // namespace a module writes under.
    templates: nuxt.options.build.templates.filter((template) =>
      /nuxt-handler-validation/.test(template.filename ?? '')
    ),
  }
}

describe('module setup wiring', () => {
  let booted: Booted

  beforeAll(async () => {
    booted = await boot()
  }, 120_000)

  afterAll(async () => {
    await booted?.nuxt.close()
  })

  it('auto-imports the three server helpers into the Nitro build', () => {
    // The whole job of the module: the wrapper, the definer and the predicate
    // in the same ambient position as `defineEventHandler`. `toEqual` over the
    // whole filtered list, so a duplicate or a fourth registration fails too.
    expect(registrationsOf(booted).serverImports).toEqual([
      {
        name: 'defineValidatedEventHandler',
        as: 'defineValidatedEventHandler',
        from: expect.stringMatching(
          /\/runtime\/server\/lib\/validated-handler$/
        ),
      },
      {
        name: 'defineValidation',
        as: 'defineValidation',
        from: expect.stringMatching(
          /\/runtime\/server\/lib\/validated-handler$/
        ),
      },
      {
        name: 'recognizeValidationError',
        as: 'recognizeValidationError',
        from: expect.stringMatching(
          /\/runtime\/server\/lib\/recognize-validation-error$/
        ),
      },
    ])
  })

  it('registers those three by name, never a directory to scan', () => {
    // A directory scan would auto-import whatever the runtime tree happens to
    // export - every internal helper included - and would widen a consumer's
    // ambient surface silently whenever a file is added.
    expect(registrationsOf(booted).serverImportDirs).toEqual([])
  })

  it('wires nothing else: no plugin, no template', () => {
    // Installing the module is the only setup step *because* the module's
    // whole job is those three imports. Anything else it registered would be
    // behaviour a consumer never asked for and cannot configure away.
    const { appPlugins, nitroPlugins, templates } = registrationsOf(booted)

    expect({ appPlugins, nitroPlugins, templates }).toEqual({
      appPlugins: [],
      nitroPlugins: [],
      templates: [],
    })
  })

  it('puts nothing at all into the app build', async () => {
    // The three are server-only: each reads an h3 event, or an error raised
    // while handling one. Read through `imports:extend`, which is where
    // `addImports` puts an app-side registration.
    const collected: Parameters<NuxtHooks['imports:extend']>[0] = []
    await booted.nuxt.callHook('imports:extend', collected)

    expect(
      collected.filter((entry) => FROM_THIS_PACKAGE.test(entry.from))
    ).toEqual([])
  })
})

describe('the `handlerValidation: false` off-switch', () => {
  it('skips setup entirely, so the module registers nothing', async () => {
    // Not an option: the module has none. Naming a `configKey` is what buys
    // the switch - kit skips the setup of any module whose config key is
    // `false` - so what is asserted here is kit's own behaviour on *this*
    // module, not a branch the module hand-rolls.
    let disabled: Booted | undefined

    try {
      disabled = await boot({ handlerValidation: false })

      expect(registrationsOf(disabled)).toEqual({
        serverImports: [],
        serverImportDirs: [],
        appPlugins: [],
        nitroPlugins: [],
        templates: [],
      })
    } finally {
      await disabled?.nuxt.close()
    }
  }, 120_000)
})
