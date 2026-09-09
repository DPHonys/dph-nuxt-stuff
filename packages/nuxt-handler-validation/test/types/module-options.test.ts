import { describe, expect, it } from 'vitest'
import module from '../../src/module'
import type { ModuleOptions } from '../../src/module'
import type { Assert, Equal } from './assert'

// The options type, asserted by the compiler under `pnpm typecheck`. The
// consumer-side half lives in `playground/module-options.check.ts`; this one
// pins the shape at the declaration itself.

/** The one option, and its type. */
export type OnlyOption = Assert<
  Equal<ModuleOptions, { checkResponses: boolean }>
>

/** Every key optional in a config: a module option carries a default. */
export const configured: Partial<ModuleOptions> = { checkResponses: false }

/** Zero options is still a legitimate configuration. */
export const nothingConfigured: Partial<ModuleOptions> = {}

/**
 * A stray key is not. `channelToken` is the sibling package's option name, so
 * it is the plausible mix-up an open options type would swallow.
 */
export const strayKey: Partial<ModuleOptions> = {
  checkResponses: true,
  // @ts-expect-error a key this module does not declare must not type-check
  channelToken: 'x',
}

/** Keeps the file in vitest's inventory. */
describe('the module’s options', () => {
  it('are asserted by the compiler', () => {
    expect(module).toBeTypeOf('function')
  })
})
