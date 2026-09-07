import { loadNuxt } from '@nuxt/kit'
import type { Nuxt, NuxtConfig, NuxtHooks } from '@nuxt/schema'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const FIXTURE = fileURLToPath(new URL('../fixtures/basic', import.meta.url))

/** Separates this module's registrations from Nuxt's and Nitro's own. */
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
 * hands over is the only public route to the resolved Nitro options.
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

/** Everything this module put into the app, in one shape. */
function registrationsOf({ nuxt, nitro }: Booted) {
  const imports = nitro?.options.imports
  const resolved = imports === false ? undefined : imports

  return {
    // `addServerImports` only queues onto `nitro:config`, so these are read off
    // the *resolved* Nitro options rather than `nuxt.options`.
    serverImports: (resolved?.imports ?? []).filter((entry) =>
      FROM_THIS_PACKAGE.test(entry.from)
    ),

    // Directories handed to Nitro to scan. A dir entry is a path or a
    // `{ glob }`, so both are read as their pattern.
    serverImportDirs: (resolved?.dirs ?? [])
      .map((dir) => (dir instanceof Object ? dir.glob : dir))
      .filter((dir) => FROM_THIS_PACKAGE.test(dir)),

    appPlugins: nuxt.options.plugins.filter((plugin) =>
      FROM_THIS_PACKAGE.test(plugin instanceof Object ? plugin.src : plugin)
    ),

    // `?? ''` because Nitro's own option type admits a hole in the array.
    nitroPlugins: (nuxt.options.nitro.plugins ?? []).filter((plugin) =>
      FROM_THIS_PACKAGE.test(plugin ?? '')
    ),

    // Templates are named, not pathed, so they match on the filename.
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

  it('auto-imports the two server helpers into the Nitro build', () => {
    // `toEqual` over the whole filtered list, so a duplicate or a third
    // registration fails too.
    expect(registrationsOf(booted).serverImports).toEqual([
      {
        name: 'defineValidatedEventHandler',
        as: 'defineValidatedEventHandler',
        from: expect.stringMatching(/\/runtime\/server\/index$/),
      },
      {
        name: 'recognizeValidationError',
        as: 'recognizeValidationError',
        from: expect.stringMatching(/\/runtime\/server\/index$/),
      },
    ])
  })

  it('registers those two by name, never a directory to scan', () => {
    // A directory scan would widen a consumer's ambient surface silently
    // whenever a file is added to the runtime tree.
    expect(registrationsOf(booted).serverImportDirs).toEqual([])
  })

  it('wires nothing else: no plugin, no template', () => {
    // Anything else it registered would be behaviour a consumer never asked for
    // and cannot configure away.
    const { appPlugins, nitroPlugins, templates } = registrationsOf(booted)

    expect({ appPlugins, nitroPlugins, templates }).toEqual({
      appPlugins: [],
      nitroPlugins: [],
      templates: [],
    })
  })

  it('puts nothing at all into the app build', async () => {
    // Read through `imports:extend`, which is where `addImports` puts an
    // app-side registration.
    const collected: Parameters<NuxtHooks['imports:extend']>[0] = []
    await booted.nuxt.callHook('imports:extend', collected)

    expect(
      collected.filter((entry) => FROM_THIS_PACKAGE.test(entry.from))
    ).toEqual([])
  })
})

describe('the `handlerValidation: false` off-switch', () => {
  it('skips setup entirely, so the module registers nothing', async () => {
    // Not an option: the module has none. Kit skips the setup of any module
    // whose config key is `false`, so this asserts kit's behaviour on *this*
    // module rather than a branch the module hand-rolls.
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
