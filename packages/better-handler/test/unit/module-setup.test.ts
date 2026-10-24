import { loadNuxt } from '@nuxt/kit'
import type { Nuxt, NuxtConfig, NuxtHooks } from '@nuxt/schema'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const FIXTURE = fileURLToPath(new URL('../fixtures/basic', import.meta.url))

/** Separates this module's registrations from Nuxt's and Nitro's own. */
const FROM_THIS_PACKAGE = /better-handler\/src\/runtime\//

/** Nitro's own instance type, without a dependency on `nitropack` for it. */
type NitroInstance = Parameters<NuxtHooks['nitro:init']>[0]

interface Booted {
  nuxt: Nuxt
  nitro: NitroInstance | undefined
}

/**
 * A real `loadNuxt` boot of the fixture app, in two steps rather than
 * `ready: true`: `nitro:init` fires during `ready()`, and the instance it
 * hands over is the only public route to the resolved Nitro options.
 */
async function boot(overrides?: NuxtConfig): Promise<Booted> {
  // Added only when present: kit types `overrides` without `undefined`, and
  // this repo compiles with `exactOptionalPropertyTypes`.
  const options: Parameters<typeof loadNuxt>[0] = { cwd: FIXTURE, ready: false }
  if (overrides !== undefined) options.overrides = overrides
  const nuxt = await loadNuxt(options)
  let nitro: NitroInstance | undefined

  nuxt.hook('nitro:init', (instance) => {
    nitro = instance
  })

  await nuxt.ready()

  return { nuxt, nitro }
}

/** What this module put into the server build. */
function registrationsOf({ nuxt, nitro }: Booted) {
  const imports = nitro?.options.imports
  const resolved = imports === false ? undefined : imports

  return {
    // `addServerImports` only queues onto `nitro:config`, so these are read
    // off the resolved Nitro options rather than `nuxt.options`.
    serverImports: (resolved?.imports ?? []).filter((entry) =>
      FROM_THIS_PACKAGE.test(entry.from)
    ),

    // `?? ''` because Nitro's own option type admits a hole in the array.
    nitroPlugins: (nuxt.options.nitro.plugins ?? []).filter((plugin) =>
      FROM_THIS_PACKAGE.test(plugin ?? '')
    ),
  }
}

describe('module setup', () => {
  let booted: Booted

  beforeAll(async () => {
    booted = await boot()
  })

  afterAll(async () => {
    await booted?.nuxt.close()
  })

  it('auto-imports the server surface into the server build, by name', () => {
    // `toEqual` over the whole filtered list, so a duplicate or an extra
    // registration fails too.
    expect(registrationsOf(booted).serverImports).toEqual(
      ['defineBetterEventHandler', 'defineError', 'recognizeKnownError'].map(
        (name) => ({
          name,
          as: name,
          from: expect.stringMatching(/\/runtime\/server\/index$/),
        })
      )
    )
  })

  it('registers no Nitro plugin while the development checks stay on', () => {
    expect(registrationsOf(booted).nitroPlugins).toEqual([])
  })
})

describe('the `devChecks` option', () => {
  it('registers the Nitro plugin that turns the checks off, and only then', async () => {
    let disabled: Booted | undefined

    try {
      disabled = await boot({ betterHandler: { devChecks: false } })

      expect(registrationsOf(disabled).nitroPlugins).toEqual([
        expect.stringMatching(/\/runtime\/server\/plugins\/dev-checks$/),
      ])
    } finally {
      await disabled?.nuxt.close()
    }
  })
})
