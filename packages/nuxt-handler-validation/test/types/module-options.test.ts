import { describe, expect, it } from 'vitest'
import module from '../../src/module'
import type { ModuleOptions } from '../../src/module'
import type { Assert, Equal } from './assert'

// The closed options type, asserted by the compiler under `pnpm typecheck`. The
// consumer-side half lives in `playground/module-options.check.ts`; this one
// pins why `Record<string, never>` was chosen, at the declaration itself.

/** What Nuxt puts in `NuxtConfig` for a module that names a config key. */
type Configured<T> = T extends Partial<ModuleOptions> ? true : false

/** Zero options is a legitimate configuration. */
export type AcceptsNothing = Assert<Configured<Record<string, never>>>

/**
 * A stray key is not. `channelToken` is the sibling package's option name, so
 * it is the plausible mix-up an open empty options type would swallow.
 */
export type RejectsStrayKey = Assert<
  Equal<Configured<{ channelToken: string }>, false>
>

/** Keeps the file in vitest's inventory. */
describe('the module’s options', () => {
  it('are asserted by the compiler', () => {
    expect(module).toBeTypeOf('function')
  })
})
