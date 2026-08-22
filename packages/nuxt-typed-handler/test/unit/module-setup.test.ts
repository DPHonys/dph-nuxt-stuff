import errorsModule from '@dphonys/nuxt-handler-errors'
import validationModule from '@dphonys/nuxt-handler-validation'
import { loadNuxt, logger } from '@nuxt/kit'
import type { Nuxt, NuxtConfig, NuxtHooks } from '@nuxt/schema'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const FIXTURE = fileURLToPath(new URL('../fixtures/basic', import.meta.url))

/** Separates this module's registrations from Nuxt's, Nitro's and the parents'. */
const FROM_THIS_PACKAGE = /nuxt-typed-handler\/src\/runtime\//

/** Nitro's own instance type, without a dependency on `nitropack` for it. */
type NitroInstance = Parameters<NuxtHooks['nitro:init']>[0]

interface Booted {
  nuxt: Nuxt
  nitro: NitroInstance | undefined
  warnings: string[]
}

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
 * A real `loadNuxt` boot of the fixture app, in two steps rather than
 * `ready: true`: `nitro:init` fires *during* `ready()`, and the instance it
 * hands over is the only public route to the resolved Nitro options.
 */
async function boot(overrides?: NuxtConfig): Promise<Booted> {
  let nuxt: Nuxt | undefined
  let nitro: NitroInstance | undefined

  const warnings = await warningsDuring(async () => {
    nuxt = await loadNuxt({ cwd: FIXTURE, ready: false, overrides })

    nuxt.hook('nitro:init', (instance) => {
      nitro = instance
    })

    await nuxt.ready()
  })

  return { nuxt: nuxt as unknown as Nuxt, nitro, warnings }
}

/** The §4.2 text, verbatim. */
function leftoverKeyWarning(key: string): string {
  return `[nuxt-typed-handler] \`${key}\` in nuxt.config is ignored: this module replaces the parent it configured. Move \`channelToken\` under \`typedHandler\` and delete \`${key}\`.`
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
        'payload',
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

  it('hoists its own types specifier onto the generated tsconfigs', () => {
    expect(booted.nuxt.options.typescript.hoist).toContain(
      '@dphonys/nuxt-typed-handler/types'
    )
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
    expect(
      (template as { getContents?: () => string } | undefined)?.getContents?.()
    ).toBe('export const configuredChannelToken = "nuxt-typed-handler"\n')
  })

  it('prepends its own stripper to the errorHandler chain, keeping Nuxt’s own', () => {
    const chain = booted.nitro?.options.errorHandler

    expect(Array.isArray(chain)).toBe(true)
    expect(chain?.[0]).toMatch(
      /nuxt-typed-handler\/src\/runtime\/server\/handlers\/channel-strip$/
    )
    expect(chain?.length).toBeGreaterThan(1)
  })

  it('warns about nothing on a clean boot', () => {
    expect(booted.warnings).toEqual([])
  })
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

        const template = disabled.nuxt.options.build.templates.find(
          (entry) => entry.filename === 'nuxt-typed-handler/channel-token.mjs'
        )

        expect(
          (
            template as { getContents?: () => string } | undefined
          )?.getContents?.()
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
      // Cast because neither key exists on this app's config any more - which
      // is the point.
      booted = await boot({
        handlerErrors: { channelToken: 'moved-me' },
        handlerValidation: false,
      } as NuxtConfig)

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
  /** The boot that must not complete, with whatever it rejected with. */
  async function rejectionOf(overrides: NuxtConfig): Promise<unknown> {
    let nuxt: Nuxt | undefined

    try {
      nuxt = await loadNuxt({ cwd: FIXTURE, ready: false, overrides })
      await nuxt.ready()
    } catch (error) {
      return error
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
      expect((error as Error).message).toBe(siblingMessage(parent))
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
      expect((error as Error).message).toBe(siblingMessage(parent))
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

    expect((error as Error).message).toBe(
      siblingMessage('@dphonys/nuxt-handler-errors')
    )
  }, 120_000)
})
