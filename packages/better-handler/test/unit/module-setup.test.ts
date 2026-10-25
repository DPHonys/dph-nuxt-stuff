import { loadNuxt } from '@nuxt/kit'
import type { Nuxt, NuxtConfig, NuxtHooks } from '@nuxt/schema'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isString } from '../../src/runtime/shared/guards'

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

/** What `addImports` queued, by calling the hook it queues onto. */
async function appImportsOf(nuxt: Nuxt) {
  const imports: Parameters<NuxtHooks['imports:extend']>[0] = []

  await nuxt.callHook('imports:extend', imports)

  return imports.filter((entry) => FROM_THIS_PACKAGE.test(entry.from))
}

/** What this module put into the server build and the app. */
function registrationsOf({ nuxt, nitro }: Booted) {
  const imports = nitro?.options.imports
  const resolved = imports === false ? undefined : imports

  return {
    // A string here: Nuxt 4.0 also admits a `RegExp` source.
    keyedComposables: nuxt.options.optimization.keyedComposables.filter(
      ({ source }) => isString(source) && FROM_THIS_PACKAGE.test(source)
    ),

    // The generated type map, by the name the module gives it.
    templates: nuxt.options.build.templates
      .map((template) => template.filename)
      .filter((filename) => filename?.includes('better-handler')),

    // `addServerImports` only queues onto `nitro:config`, so these are read
    // off the resolved Nitro options rather than `nuxt.options`.
    serverImports: (resolved?.imports ?? []).filter((entry) =>
      FROM_THIS_PACKAGE.test(entry.from)
    ),

    // `?? ''` because Nitro's own option type admits a hole in the array.
    nitroPlugins: (nuxt.options.nitro.plugins ?? []).filter((plugin) =>
      FROM_THIS_PACKAGE.test(plugin ?? '')
    ),

    // Nuxt normalises every entry to an object once a module adds it.
    appPlugins: nuxt.options.plugins
      .map((plugin) => (isString(plugin) ? { src: plugin } : plugin))
      .filter((plugin) => FROM_THIS_PACKAGE.test(plugin.src))
      .map(({ src, mode }) => ({ src, mode })),
  }
}

/** The Nitro plugin installing `$betterFetch` and `event.$betterFetch`. */
const BETTER_FETCH_NITRO_PLUGIN = expect.stringMatching(
  /\/runtime\/server\/plugins\/better-fetch$/
)

/** One composable auto-import, from its file under `runtime/app/composables/`. */
function composable(name: string, file: string) {
  return {
    name,
    from: expect.stringMatching(
      new RegExp(`/runtime/app/composables/${file}$`)
    ),
  }
}

/** One keyed composable, keyed as vanilla's are. */
function keyed(name: string, file: string) {
  return {
    name,
    source: expect.stringMatching(
      new RegExp(`/runtime/app/composables/${file}$`)
    ),
    argumentLength: 3,
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

  it('installs the fetch family on both sides, the app half in the browser only', () => {
    expect(registrationsOf(booted).nitroPlugins).toEqual([
      BETTER_FETCH_NITRO_PLUGIN,
    ])
    expect(registrationsOf(booted).appPlugins).toEqual([
      {
        src: expect.stringMatching(
          /\/runtime\/app\/plugins\/better-fetch\.client\.ts$/
        ),
        mode: 'client',
      },
    ])
  })

  it('auto-imports the five composables into the app, by name', async () => {
    expect(await appImportsOf(booted.nuxt)).toEqual([
      composable('useBetterFetch', 'use-better-fetch'),
      composable('useLazyBetterFetch', 'use-better-fetch'),
      composable('useBetterAsyncData', 'use-better-async-data'),
      composable('useLazyBetterAsyncData', 'use-better-async-data'),
      composable('useRequestBetterFetch', 'use-request-better-fetch'),
    ])
  })

  it('has the compiler key every fetch and async-data composable, as vanilla’s', () => {
    expect(registrationsOf(booted).keyedComposables).toEqual([
      keyed('useBetterFetch', 'use-better-fetch'),
      keyed('useLazyBetterFetch', 'use-better-fetch'),
      keyed('useBetterAsyncData', 'use-better-async-data'),
      keyed('useLazyBetterAsyncData', 'use-better-async-data'),
    ])
  })

  it('adds the one generated type map', () => {
    expect(registrationsOf(booted).templates).toEqual([
      'types/better-handler.d.ts',
    ])
  })
})

describe('the `devChecks` option', () => {
  it('registers the Nitro plugin that turns the checks off, and only then', async () => {
    let disabled: Booted | undefined

    try {
      disabled = await boot({ betterHandler: { devChecks: false } })

      expect(registrationsOf(disabled).nitroPlugins).toEqual([
        BETTER_FETCH_NITRO_PLUGIN,
        expect.stringMatching(/\/runtime\/server\/plugins\/dev-checks$/),
      ])
    } finally {
      await disabled?.nuxt.close()
    }
  })
})
