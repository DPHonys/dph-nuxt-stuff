import { describe, expect, it } from 'vitest'
import module from '../../src/module'
import type { ModuleOptions } from '../../src/module'
import type { Assert, Equal } from './assert'

// The options type, asserted by the compiler under `pnpm typecheck`: the
// umbrella carries its own `channelToken` beside the validation parent's
// `checkResponses`, forwarded under this module's key rather than the parent's.

/** Both options, and nothing else. */
export type BothOptions = Assert<
  Equal<
    ModuleOptions,
    { channelToken: string | false; checkResponses: boolean }
  >
>

/** The parent's option, under this module's key. */
export const checkResponses: Partial<ModuleOptions> = { checkResponses: false }

/** Either alone, or neither: every option carries a default. */
export const channelOnly: Partial<ModuleOptions> = { channelToken: false }
export const nothingConfigured: Partial<ModuleOptions> = {}

/**
 * A stray key is refused. The parent's config key is the plausible mix-up: an
 * app that moved off the parents writes its options here, not under
 * `handlerValidation`.
 */
export const strayKey: Partial<ModuleOptions> = {
  checkResponses: true,
  // @ts-expect-error a key this module does not declare must not type-check
  handlerValidation: { checkResponses: false },
}

/** Keeps the file in vitest's inventory. */
describe('the module’s options', () => {
  it('are asserted by the compiler', () => {
    expect(module).toBeTypeOf('function')
  })
})
