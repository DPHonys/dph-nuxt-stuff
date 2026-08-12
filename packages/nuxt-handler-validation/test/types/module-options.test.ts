import { describe, expect, it } from 'vitest'
import module from '../../src/module'
import type { ModuleOptions } from '../../src/module'

/**
 * The closed options type, asserted by the compiler under `pnpm typecheck`.
 *
 * This is the package-side half of the module-typing check; the consumer-side
 * half lives in `playground/module-options.check.ts`, where Nuxt's generated
 * `NuxtConfig` entry exists. The two are not redundant: this one pins *why*
 * `Record<string, never>` was chosen, so a later widening of `ModuleOptions`
 * fails here, at the declaration, rather than only inside a generated app.
 */

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false

type Expect<T extends true> = T

/** What Nuxt puts in `NuxtConfig` for a module that names a config key. */
type Configured<T> = T extends Partial<ModuleOptions> ? true : false

/** Zero options is a legitimate configuration. */
export type AcceptsNothing = Expect<Configured<Record<string, never>>>

/**
 * A stray key is not. `channelToken` is the sibling package's option name, and
 * so the plausible mix-up the closed type exists to catch - an open empty
 * options type would swallow it.
 */
export type RejectsStrayKey = Expect<
  Equal<Configured<{ channelToken: string }>, false>
>

/** Keeps the file in vitest's inventory. */
describe('the module’s options', () => {
  it('are asserted by the compiler', () => {
    expect(module).toBeTypeOf('function')
  })
})
