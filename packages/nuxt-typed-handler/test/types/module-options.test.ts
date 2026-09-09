import { describe, expect, it } from 'vitest'
import module from '../../src/module'
import type { ModuleOptions } from '../../src/module'
import type { Assert, Equal } from './assert'

// The options type, asserted by the compiler under `pnpm typecheck`: the
// umbrella carries its own `channelToken` beside the validation parent's
// `checkResponses`, forwarded under this module's key rather than the parent's.
//
// Not here: "every option carries a default, so a consumer may omit the key
// entirely". A `Partial<ModuleOptions>` position accepts `{}` whatever the
// module declares, so that claim has no compile-time seat to fail at; it is
// asserted against the resolved options in `test/unit/module-setup.test.ts`.

/** Both options, and nothing else. */
export type BothOptions = Assert<
  Equal<
    ModuleOptions,
    { channelToken: string | false; checkResponses: boolean }
  >
>

/** The parent's option, under this module's key. */
export const checkResponses: Partial<ModuleOptions> = { checkResponses: false }

/** Either one alone: the other still resolves from its default. */
export const channelOnly: Partial<ModuleOptions> = { channelToken: false }

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
