import { loadNuxt } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Structural module-wiring: what `setup()` *registers*, observed on a real
 * `loadNuxt` boot of the playground — layer 3's fixture without its build
 * mode, because `nuxt prepare`'s output cannot see registration at all
 * (`keyedComposables` leaves no artifact in `.nuxt`; measured).
 *
 * A hand-stubbed `nuxt` fed to `setup()` directly runs in a tenth of the
 * time, but its shape is dictated implicitly by whatever `@nuxt/kit` helpers
 * the module happens to call — a kit upgrade breaks the stub opaquely, and
 * asserting into an invented shape is exactly the internals-coupling the
 * suite's contracts-not-internals rule exists to keep out. The boot is
 * shared: one `beforeAll`, every wiring assertion reads from it.
 *
 * Like the rest of the suite, this consumes the module through its real
 * published entry (`dist/module.mjs` via the playground), so a red here means
 * the *shipped* wiring regressed, not the sources.
 */
describe('module setup wiring', () => {
  let nuxt: Nuxt

  beforeAll(async () => {
    nuxt = await loadNuxt({
      cwd: fileURLToPath(new URL('../playground', import.meta.url)),
      ready: true,
    })
  }, 60_000)

  afterAll(async () => {
    await nuxt?.close()
  })

  it('registers the composable pair as keyed, with vanilla’s argument length', () => {
    // The two `keyedComposables.push` lines are load-bearing (SPEC.md §3.4):
    // without them Nuxt's compiler injects no per-call-site key, duplicate
    // fetches collapse onto one `useAsyncData` entry, and the wrapper is
    // *behaviourally* narrower than the `useFetch` it mirrors — §6.1's
    // degradation lock failing one layer below the types. The SSR
    // payload-count observation that measured that (9 vs 7 data keys) stays
    // untested — it counts keys in Nuxt's payload format, not this module's
    // contract — but the registration it measured is contract, and is what
    // this asserts.
    const entries = nuxt.options.optimization.keyedComposables.filter(
      ({ name }) => name === 'useTypedFetch' || name === 'useLazyTypedFetch'
    )

    // `toEqual` over the whole filtered list, so a duplicate registration is
    // a failure too. `argumentLength: 3` is vanilla `useFetch`'s own
    // (`request`, `opts`-or-key, key): the key is appended only to calls that
    // did not already name one.
    expect(entries).toEqual([
      {
        name: 'useTypedFetch',
        source: expect.stringMatching(/\/runtime\/app\/use-typed-fetch$/),
        argumentLength: 3,
      },
      {
        name: 'useLazyTypedFetch',
        source: expect.stringMatching(/\/runtime\/app\/use-typed-fetch$/),
        argumentLength: 3,
      },
    ])
  })
})
