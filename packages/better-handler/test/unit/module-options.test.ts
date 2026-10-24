import { loadNuxt } from '@nuxt/kit'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import module from '../../src/module'
import type { ModuleOptions } from '../../src/module'

const FIXTURE = fileURLToPath(new URL('../fixtures/basic', import.meta.url))

type Overrides = NonNullable<Parameters<typeof loadNuxt>[0]['overrides']>

/**
 * The options kit resolves for this module in a real `loadNuxt` boot of the
 * fixture app, with `overrides` standing in for the app's `nuxt.config`.
 */
async function resolvedOptions(overrides?: Overrides) {
  // Added only when present: kit types `overrides` without `undefined`, and
  // this repo compiles with `exactOptionalPropertyTypes`.
  const options: Parameters<typeof loadNuxt>[0] = { cwd: FIXTURE, ready: false }
  if (overrides !== undefined) options.overrides = overrides
  const nuxt = await loadNuxt(options)

  try {
    return await module.getOptions?.(undefined, nuxt)
  } finally {
    await nuxt.close()
  }
}

describe('the `betterHandler` config key', () => {
  it('turns the development checks on when the app configures nothing', async () => {
    // Matched against a complete `ModuleOptions`, so an option added without
    // a default fails here.
    expect(await resolvedOptions()).toEqual({
      devChecks: true,
    } satisfies ModuleOptions)
  })

  it('hands setup `devChecks: false` when the app turns them off', async () => {
    expect(
      await resolvedOptions({ betterHandler: { devChecks: false } })
    ).toEqual({ devChecks: false } satisfies ModuleOptions)
  })
})

describe('the module meta', () => {
  it('claims every Nuxt 4 under the `betterHandler` key', async () => {
    // What kit checks an app's Nuxt against before it runs setup.
    expect(await module.getMeta?.()).toMatchObject({
      configKey: 'betterHandler',
      compatibility: { nuxt: '>=4.0.0 <5.0.0' },
    })
  })
})
