import { afterEach, expect, it } from 'vitest'
import plugin from '../src/runtime/app/typed-fetch.plugin'
import { $typedFetch } from '../src/runtime/typed-fetch'

/**
 * The client plugin's one assignment (SPEC.md §3.5): executing it puts *the*
 * `$typedFetch` — the same object `src/runtime/typed-fetch` exports — onto
 * `globalThis`. Identity, not shape: a plugin that installed a lookalike
 * would pass every shape check and still be a second instance with §7.2's
 * instance-identity problem.
 *
 * The plugin is app-side (`defineNuxtPlugin` from `#app`), so it loads here
 * through the same recording-double alias `use-typed-fetch.test.ts` uses;
 * the double's `defineNuxtPlugin` hands back the setup function unchanged.
 * That the plugin is *registered* client-only is `module-setup.test.ts`;
 * that Nuxt runs a registered client plugin in a real browser is upstream's
 * contract, deliberately not protected.
 */

afterEach(() => {
  delete (globalThis as { $typedFetch?: unknown }).$typedFetch
})

it('assigns the module’s own $typedFetch to globalThis', () => {
  expect(globalThis.$typedFetch).toBeUndefined()

  ;(plugin as () => void)()

  expect(globalThis.$typedFetch).toBe($typedFetch)
})
