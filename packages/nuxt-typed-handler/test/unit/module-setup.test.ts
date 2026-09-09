import errorsModule from '@dphonys/nuxt-handler-errors'
import validationModule from '@dphonys/nuxt-handler-validation'
import { loadNuxt, logger } from '@nuxt/kit'
import type {
  Nuxt,
  NuxtApp,
  NuxtConfig,
  NuxtHooks,
  NuxtPlugin,
  NuxtTemplate,
  ResolvedNuxtTemplate,
} from '@nuxt/schema'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import typedHandlerModule from '../../src/module'
import type { ModuleOptions } from '../../src/module'

const FIXTURE = fileURLToPath(new URL('../fixtures/basic', import.meta.url))

/** Separates this module's registrations from Nuxt's, Nitro's and the parents'. */
const FROM_THIS_PACKAGE = /nuxt-typed-handler\/src\/runtime\//

// Where the map lands: Nitro's `typesDir`. Spelled out rather than imported
// from `src/module.ts`, so a moved file fails here instead of being followed.
const TEMPLATE_FILENAME = 'types/nuxt-typed-handler.d.ts'

/** Nitro's own instance type, without a dependency on `nitropack` for it. */
type NitroInstance = Parameters<NuxtHooks['nitro:init']>[0]

interface Booted {
  nuxt: Nuxt
  nitro: NitroInstance | undefined
  warnings: string[]
}

/**
 * `run`'s result, with everything the kit logger warned while it executed.
 * The reporter seam rather than a console spy: consola's default reporter
 * writes to stdout directly, so a `console.warn` spy never sees it.
 */
async function warningsDuring<T>(
  run: () => Promise<T>
): Promise<{ result: T; warnings: string[] }> {
  const warnings: string[] = []
  const reporter: Parameters<typeof logger.addReporter>[0] = {
    log: (entry) => {
      if (entry.type === 'warn') warnings.push(entry.args.map(String).join(' '))
    },
  }

  logger.addReporter(reporter)

  try {
    return { result: await run(), warnings }
  } finally {
    logger.removeReporter(reporter)
  }
}

/**
 * A real `loadNuxt` boot of the fixture app, in two steps rather than
 * `ready: true`: `nitro:init` fires *during* `ready()`, and the instance it
 * hands over is the only public route to the resolved Nitro options.
 */
async function boot(overrides?: NuxtConfig): Promise<Booted> {
  let nitro: NitroInstance | undefined

  const { result: nuxt, warnings } = await warningsDuring(async () => {
    const loaded = await loadNuxt({ cwd: FIXTURE, ready: false, overrides })

    loaded.hook('nitro:init', (instance) => {
      nitro = instance
    })

    await loaded.ready()

    return loaded
  })

  return { nuxt, nitro, warnings }
}

/** Whether Nuxt has resolved a template: both generated fields present. */
function isResolved(template: NuxtTemplate): template is ResolvedNuxtTemplate {
  return template.filename !== undefined && template.dst !== undefined
}

/** Kit registers every plugin as an object; a string entry is the app's own. */
function isPluginObject(entry: NuxtPlugin | string): entry is NuxtPlugin {
  return entry instanceof Object
}

/** A template's contents, rendered with the booted app in scope. */
function contentsOf(
  booted: Booted,
  filename: string
): string | Promise<string> | undefined {
  const template = booted.nuxt.options.build.templates.find(
    (entry) => entry.filename === filename
  )

  // An app nothing has been scanned into: `loadNuxt` builds none, and the
  // templates under test read only what they captured.
  const app: NuxtApp = {
    dir: booted.nuxt.options.srcDir,
    extensions: booted.nuxt.options.extensions,
    plugins: [],
    components: [],
    layouts: {},
    middleware: [],
    templates: [],
    configs: [],
  }

  return template?.getContents?.({
    nuxt: booted.nuxt,
    app,
    options: template.options ?? {},
  })
}

/** The Nitro plugins registered, as paths. */
// `?? ''` because Nitro's own option type admits a hole in the array.
function nitroPluginsOf(booted: Booted): string[] {
  return (booted.nuxt.options.nitro.plugins ?? []).map((plugin) => plugin ?? '')
}

/** The §4.2 text, verbatim. */
function leftoverKeyWarning(key: string): string {
  return `[nuxt-typed-handler] \`${key}\` in nuxt.config is ignored: this module replaces the parent it configured. Move its options under \`typedHandler\` and delete \`${key}\`.`
}

/** The §4.6 text, verbatim. */
function siblingMessage(parent: string): string {
  return `[nuxt-typed-handler] \`${parent}\` is also registered in \`modules\`. @dphonys/nuxt-typed-handler replaces it: remove \`${parent}\` (and uninstall it), then move any \`channelToken\` under \`typedHandler\`.`
}

describe('module setup wiring', () => {
  let booted: Booted

  beforeAll(async () => {
    booted = await boot()
  }, 120_000)

  afterAll(async () => {
    await booted?.nuxt.close()
  })

  it('hands setup every option from its default: the fixture configures none', async () => {
    // The claim `nothingConfigured: Partial<ModuleOptions> = {}` looks like it
    // makes and cannot - that position accepts `{}` whatever the module
    // declares. This is what kit resolves for an app with no `typedHandler`
    // key at all, matched against a *complete* `ModuleOptions`, so an option
    // added without a default fails here - the forwarded `checkResponses`
    // above all, whose default is the whole of "the parent's check is on
    // unless this key turns it off".
    const resolved = await typedHandlerModule.getOptions?.(
      undefined,
      booted.nuxt
    )

    expect(resolved).toEqual({
      channelToken: 'nuxt-typed-handler',
      checkResponses: true,
    } satisfies ModuleOptions)
  })

  it('auto-imports the five server helpers and neither parent wrapper', () => {
    // Read off the *resolved* Nitro options - `addServerImports` only queues
    // onto `nitro:config`. `toEqual` over the whole filtered list, so a
    // duplicate or a leaked parent wrapper fails too.
    const imports = booted.nitro?.options.imports
    const entries = (imports === false ? [] : (imports?.imports ?? [])).filter(
      (entry) => FROM_THIS_PACKAGE.test(entry.from)
    )

    expect(entries).toEqual(
      [
        'defineTypedEventHandler',
        'defineError',
        'recognizeKnownError',
        'recognizeValidationError',
      ].map((name) => ({
        name,
        as: name,
        from: expect.stringMatching(/\/runtime\/server\/index$/),
      }))
    )
  })

  it('transpiles the errors parent, whose app internals import `#app`', () => {
    expect(booted.nuxt.options.build.transpile).toContain(
      '@dphonys/nuxt-handler-errors'
    )
    // The validation parent's contract says push nothing.
    expect(booted.nuxt.options.build.transpile).not.toContain(
      '@dphonys/nuxt-handler-validation'
    )
  })

  it('hoists its own types specifier, and neither parent’s', () => {
    // The parents' specifiers are mapped through `paths` (§4.7): `hoist`
    // resolves from the app's `modulesDir` alone and silently drops what it
    // cannot find there - an umbrella-only install has no parent to find.
    expect(
      booted.nuxt.options.typescript.hoist.filter((entry) =>
        entry.startsWith('@dphonys/')
      )
    ).toEqual(['@dphonys/nuxt-typed-handler/types'])
  })

  it('registers one map template, for the nuxt, shared and nitro programs', async () => {
    // One filename, in Nitro's `typesDir`; `addTypeTemplate`'s context flags
    // are observed through the hooks they subscribe - the public trace each
    // leaves. Every program must reach the map, as each has call sites.
    const templates = booted.nuxt.options.build.templates.filter(
      (template) => template.filename === TEMPLATE_FILENAME
    )

    expect(templates).toHaveLength(1)

    const dst = templates[0]?.dst ?? ''
    const payload = {
      references: [],
      declarations: [],
      tsConfig: { compilerOptions: {} },
      nodeTsConfig: { compilerOptions: {} },
      nodeReferences: [],
      sharedTsConfig: { compilerOptions: {} },
      sharedReferences: [],
    }

    await booted.nuxt.callHook('prepare:types', payload)

    expect(payload.references).toContainEqual({ path: dst })
    expect(payload.sharedReferences).toContainEqual({ path: dst })
    expect(payload.nodeReferences).not.toContainEqual({ path: dst })

    const nitroPayload = { references: [], declarations: [] }

    await booted.nuxt.callHook('nitro:prepare:types', nitroPayload)

    expect(nitroPayload.references).toContainEqual({ path: dst })
  })

  it('re-renders exactly the map template when this nitro’s types:extend fires', async () => {
    // `types:extend` fires inside Nitro's `writeTypes` after a fresh
    // `scanHandlers`. `updateTemplates` is, publicly, one
    // `builder:generateApp` call carrying a template filter.
    const renders: { filter?: (template: ResolvedNuxtTemplate) => boolean }[] =
      []

    booted.nuxt.hook('builder:generateApp', (options) => {
      renders.push(options ?? {})
    })

    await booted.nitro?.hooks.callHook('types:extend', { routes: {} })

    // Exactly one: a duplicate hook registration re-renders every template
    // twice per route change.
    expect(renders).toHaveLength(1)

    const selected = booted.nuxt.options.build.templates
      .filter(isResolved)
      .filter((template) => renders[0]?.filter?.(template) ?? false)
      .map((template) => template.filename)

    expect(selected).toEqual([TEMPLATE_FILENAME])
  })

  it('writes the channel token under its own alias, defaulting to its name', () => {
    const dst = booted.nuxt.options.alias['#nuxt-typed-handler/channel-token']

    expect(dst).toMatch(/\/nuxt-typed-handler\/channel-token\.mjs$/)
    expect(
      booted.nitro?.options.alias?.['#nuxt-typed-handler/channel-token']
    ).toBe(dst)

    const template = booted.nuxt.options.build.templates.find(
      (entry) => entry.filename === 'nuxt-typed-handler/channel-token.mjs'
    )

    expect(template?.write).toBe(true)
    expect(contentsOf(booted, 'nuxt-typed-handler/channel-token.mjs')).toBe(
      'export const configuredChannelToken = "nuxt-typed-handler"\n'
    )
  })

  it('prepends its own stripper to the errorHandler chain, keeping Nuxt’s own', () => {
    const chain = booted.nitro?.options.errorHandler

    expect(Array.isArray(chain)).toBe(true)
    expect(chain?.[0]).toMatch(
      /nuxt-typed-handler\/src\/runtime\/server\/handlers\/channel-strip$/
    )
    expect(chain?.length).toBeGreaterThan(1)
  })

  it('auto-imports the five app composables and nothing from `shared`', async () => {
    // `matchError` is deliberately absent - `/shared` is its only way in.
    // Read through `imports:extend`, which is where `addImports` puts them.
    const collected: Parameters<NuxtHooks['imports:extend']>[0] = []
    await booted.nuxt.callHook('imports:extend', collected)

    const names = collected
      .map((entry) => entry.name)
      .filter((name) => name.includes('Typed') || name === 'matchError')

    expect(names).toEqual([
      'useTypedFetch',
      'useLazyTypedFetch',
      'useTypedAsyncData',
      'useLazyTypedAsyncData',
      'useRequestTypedFetch',
    ])
  })

  it('registers all four wrappers as keyed, with vanilla\u2019s argument length', () => {
    // Without these Nuxt injects no per-call-site key and duplicate calls
    // collapse onto one `useAsyncData` entry. `useRequestTypedFetch` is not
    // among them: it hands back a fetcher, it caches nothing.
    const entries = booted.nuxt.options.optimization.keyedComposables.filter(
      ({ name }) => name.includes('Typed')
    )

    // `toEqual` over the whole filtered list, so a duplicate registration
    // fails too. `argumentLength: 3` is vanilla's own.
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
      {
        name: 'useTypedAsyncData',
        source: expect.stringMatching(
          /\/runtime\/app\/composables\/use-typed-async-data$/
        ),
        argumentLength: 3,
      },
      {
        name: 'useLazyTypedAsyncData',
        source: expect.stringMatching(
          /\/runtime\/app\/composables\/use-typed-async-data$/
        ),
        argumentLength: 3,
      },
    ])
  })

  it('registers the app $typedFetch plugin, client-only', () => {
    // `mode: 'client'` is load-bearing - an all-modes app plugin writes the
    // same `globalThis` during SSR and masks the Nitro plugin's deletion.
    const entries = booted.nuxt.options.plugins
      .filter(isPluginObject)
      .filter((plugin) =>
        /\/runtime\/app\/plugins\/typed-fetch\.client(?:\.\w+)?$/.test(
          plugin.src
        )
      )

    // `toMatchObject` because kit stamps each entry with a marker symbol.
    expect(entries).toHaveLength(1)
    expect(entries).toMatchObject([{ mode: 'client' }])
  })

  it('registers the two Nitro plugins separately, so each is deletable', () => {
    const registered = nitroPluginsOf(booted)

    expect(
      registered.filter((plugin) =>
        plugin.endsWith('/runtime/server/plugins/typed-fetch')
      )
    ).toHaveLength(1)
    expect(
      registered.filter((plugin) =>
        plugin.endsWith('/runtime/server/plugins/event-typed-fetch')
      )
    ).toHaveLength(1)
  })

  it('registers no response-check plugin while the check is on', () => {
    // The option carries no value into the bundle: the plugin's presence is
    // the whole of the setting, so the default costs nothing at all.
    expect(
      nitroPluginsOf(booted).filter((plugin) =>
        plugin.endsWith('/runtime/server/plugins/response-check')
      )
    ).toEqual([])
  })

  it('warns about nothing on a clean boot', () => {
    expect(booted.warnings).toEqual([])
  })
})

describe('the `checkResponses` option', () => {
  it('registers the plugin that turns the parent’s check off, and only then', async () => {
    // The validation parent owns the check; this module forwards the option
    // under its own key and clears the parent's flag through its own plugin.
    let disabled: Booted | undefined

    try {
      disabled = await boot({ typedHandler: { checkResponses: false } })

      expect(
        nitroPluginsOf(disabled).filter((plugin) =>
          plugin.endsWith('/runtime/server/plugins/response-check')
        )
      ).toHaveLength(1)
    } finally {
      await disabled?.nuxt.close()
    }
  }, 120_000)
})

describe('the channel token', () => {
  it.each<[string, false | '', unknown[]]>([
    ['false', false, []],
    [
      'an empty string',
      '',
      [expect.stringMatching(/channelToken.*empty string/)],
    ],
  ])(
    'disables gating for %s, and registers no stripper',
    async (_label, channelToken, expectedWarnings) => {
      let disabled: Booted | undefined

      try {
        disabled = await boot({ typedHandler: { channelToken } })

        const chain = disabled.nitro?.options.errorHandler
        const entries = Array.isArray(chain) ? chain : [chain ?? '']

        expect(
          entries.filter((entry) => /channel-strip/.test(String(entry)))
        ).toEqual([])

        expect(
          contentsOf(disabled, 'nuxt-typed-handler/channel-token.mjs')
        ).toBe('export const configuredChannelToken = undefined\n')

        expect(disabled.warnings).toEqual(expectedWarnings)
      } finally {
        await disabled?.nuxt.close()
      }
    },
    120_000
  )
})

describe('the leftover parent config keys', () => {
  it('warns once per key, with the documented text, whatever the value', async () => {
    let booted: Booted | undefined

    try {
      // `false` is a value too: the parent's off-switch has nothing to switch.
      // Neither key exists on this app's config any more - which is the point.
      booted = await boot({
        // @ts-expect-error - the parents' keys, gone from this app's config
        handlerErrors: { channelToken: 'moved-me' },
        handlerValidation: false,
      })

      expect(booted.warnings).toEqual([
        leftoverKeyWarning('handlerErrors'),
        leftoverKeyWarning('handlerValidation'),
      ])
    } finally {
      await booted?.nuxt.close()
    }
  }, 120_000)
})

describe('the sibling guard', () => {
  /**
   * The boot that must not complete, with the error it rejected with. A
   * rejection that is not an error is reported as one, so the assertion on
   * the message names it.
   */
  async function rejectionOf(
    overrides: NuxtConfig
  ): Promise<Error | undefined> {
    let nuxt: Nuxt | undefined

    try {
      nuxt = await loadNuxt({ cwd: FIXTURE, ready: false, overrides })
      await nuxt.ready()
    } catch (cause) {
      return cause instanceof Error
        ? cause
        : new TypeError('the boot rejected with a non-error', { cause })
    } finally {
      await nuxt?.close()
    }

    return undefined
  }

  it.each([
    ['the errors parent, by package name', '@dphonys/nuxt-handler-errors'],
    [
      'the validation parent, by package name',
      '@dphonys/nuxt-handler-validation',
    ],
  ])(
    'throws at modules:done for %s',
    async (_label, parent) => {
      const error = await rejectionOf({ modules: [parent] })

      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toBe(siblingMessage(parent))
    },
    120_000
  )

  it.each([
    [
      'the errors parent, as a module instance',
      errorsModule,
      '@dphonys/nuxt-handler-errors',
    ],
    [
      'the validation parent, as a module instance',
      validationModule,
      '@dphonys/nuxt-handler-validation',
    ],
  ])(
    'throws for %s, which only its meta name can identify',
    async (_label, module, parent) => {
      // Listed as a value rather than a string, the parent is known to kit by
      // its `meta.name` alone - the second spelling the guard tries.
      const error = await rejectionOf({ modules: [module] })

      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toBe(siblingMessage(parent))
    },
    120_000
  )

  it('names the errors parent first when both are present', async () => {
    const error = await rejectionOf({
      modules: [
        '@dphonys/nuxt-handler-errors',
        '@dphonys/nuxt-handler-validation',
      ],
    })

    expect(error?.message).toBe(siblingMessage('@dphonys/nuxt-handler-errors'))
  }, 120_000)
})
