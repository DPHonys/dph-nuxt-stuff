import { loadNuxt, logger } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import type { Nitro } from 'nitropack/types'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { addChannelStripErrorHandler } from '../../src/build/channel-strip'
import {
  addChannelToken,
  normalizeChannelToken,
} from '../../src/build/channel-token'
import { warnCustomErrorHandler } from '../../src/build/error-handler-warning'

const FIXTURE = fileURLToPath(new URL('../fixtures/basic', import.meta.url))

/**
 * Boots the fixture with `install` run from `modules:before` - the same
 * stage a module's `setup` runs at - and hands back the Nuxt and Nitro
 * instances so the test can read what the helper registered on both builds.
 */
async function bootWith(
  install: (nuxt: Nuxt) => void
): Promise<{ nuxt: Nuxt; nitro: Nitro | undefined }> {
  const nuxt = await loadNuxt({ cwd: FIXTURE, ready: false })
  let nitro: Nitro | undefined

  nuxt.hook('modules:before', () => {
    install(nuxt)
  })

  nuxt.hook('nitro:init', (instance) => {
    nitro = instance
  })

  await nuxt.ready()

  return { nuxt, nitro }
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

describe('normalizeChannelToken', () => {
  it('passes a non-empty string through untouched', () => {
    expect(normalizeChannelToken('tok', 'other-name')).toBe('tok')
  })

  it('maps `false` to undefined without warning', async () => {
    let result: string | undefined = 'unset'

    const warnings = await warningsDuring(async () => {
      result = normalizeChannelToken(false, 'other-name')
    })

    expect(result).toBeUndefined()
    expect(warnings).toEqual([])
  })

  it('maps `""` to undefined and warns under the caller’s prefix', async () => {
    let result: string | undefined = 'unset'

    const warnings = await warningsDuring(async () => {
      result = normalizeChannelToken('', 'other-name')
    })

    expect(result).toBeUndefined()
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(
      /^\[other-name\] `channelToken` is an empty string/
    )
  })
})

describe('addChannelToken', () => {
  it('writes the template and aliases it on both builds under the caller’s name', async () => {
    let specifier: string | undefined
    const { nuxt, nitro } = await bootWith((instance) => {
      specifier = addChannelToken(instance, 'other-name', 'tok')
    })

    try {
      expect(specifier).toBe('#other-name/channel-token')

      const template = nuxt.options.build.templates.find(
        (entry) => entry.filename === 'other-name/channel-token.mjs'
      )

      expect(template?.write).toBe(true)
      expect(
        (
          template as { getContents?: () => string } | undefined
        )?.getContents?.()
      ).toBe('export const configuredChannelToken = "tok"\n')

      const dst = nuxt.options.alias['#other-name/channel-token']
      expect(dst).toMatch(/\/other-name\/channel-token\.mjs$/)
      expect(nitro?.options.alias['#other-name/channel-token']).toBe(dst)
    } finally {
      await nuxt.close()
    }
  }, 120_000)

  it('renders an undefined token as the `undefined` literal', async () => {
    const { nuxt } = await bootWith((instance) => {
      addChannelToken(instance, 'other-name', undefined)
    })

    try {
      const template = nuxt.options.build.templates.find(
        (entry) => entry.filename === 'other-name/channel-token.mjs'
      )

      expect(
        (
          template as { getContents?: () => string } | undefined
        )?.getContents?.()
      ).toBe('export const configuredChannelToken = undefined\n')
    } finally {
      await nuxt.close()
    }
  }, 120_000)
})

/** Nitro's resolved error-handler chain, every entry as a string. */
function chainOf(nitro: Nitro | undefined): string[] {
  const chain = nitro?.options.errorHandler
  return (Array.isArray(chain) ? chain : [chain]).map(String)
}

describe('addChannelStripErrorHandler', () => {
  const HANDLER = '/virtual/other-name/channel-strip'

  it.each([
    { label: 'an undefined chain', existing: undefined, preserved: [] },
    { label: 'a string chain', existing: '~/one', preserved: ['~/one'] },
    {
      label: 'an array chain',
      existing: ['~/one', '~/two'],
      preserved: ['~/one', '~/two'],
    },
  ])(
    'prepends the handler to $label and keeps every entry in order',
    async ({ existing, preserved }) => {
      const { nuxt, nitro } = await bootWith((instance) => {
        // The fixture leaves the slot unset, so `undefined` is the boot as is.
        if (existing !== undefined) {
          instance.options.nitro.errorHandler = existing
        }

        addChannelStripErrorHandler(instance, 'tok', HANDLER)
      })

      try {
        // The fixture's own module prepends its stripper too and Nitro
        // appends its builtin, so the assertion is on relative order: the
        // handler sits ahead of every entry it found, none dropped.
        const ours = new Set([HANDLER, ...preserved])
        expect(chainOf(nitro).filter((entry) => ours.has(entry))).toEqual([
          HANDLER,
          ...preserved,
        ])
      } finally {
        await nuxt.close()
      }
    },
    120_000
  )

  it('is a no-op without a token', async () => {
    const { nuxt, nitro } = await bootWith((instance) => {
      instance.options.nitro.errorHandler = '~/one'
      addChannelStripErrorHandler(instance, undefined, HANDLER)
    })

    try {
      expect(chainOf(nitro)).not.toContain(HANDLER)
      expect(chainOf(nitro)).toContain('~/one')
    } finally {
      await nuxt.close()
    }
  }, 120_000)
})

describe('warnCustomErrorHandler', () => {
  it('warns under the caller’s prefix only when a handler is set', async () => {
    const unset = { options: { nitro: {} } } as Nuxt
    const set = { options: { nitro: { errorHandler: '~/one' } } } as Nuxt

    const warnings = await warningsDuring(async () => {
      warnCustomErrorHandler(unset, 'other-name')
      warnCustomErrorHandler(set, 'other-name')
    })

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(
      /^\[other-name\] A custom `nitro.errorHandler` is set/
    )
    expect(warnings[0]).toMatch(/data/)
  })
})
