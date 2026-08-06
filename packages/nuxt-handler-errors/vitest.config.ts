import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Three projects, because the suites here cost three very different things and
 * a single config has to price them all at the worst case.
 *
 * - `unit` is the fast tier, and the **only** one that sees the `#app` alias.
 * - `types` compiles fixture programs through the TypeScript API; a fixture
 *   costs stock TypeScript one to three seconds, and a test that compiles two
 *   would flirt with the 5s default on a loaded box. Hence the timeout, scoped
 *   to the tier that needs it rather than granted to everything.
 * - `e2e` builds real apps — `@nuxt/test-utils` for two of them, a spawned
 *   `nuxt build` for the map. Minutes, not seconds.
 *
 * Each project names its `include`. That is also what keeps knip supplied with
 * entry patterns for this workspace: with none, `treatConfigHintsAsErrors`
 * reports every suite as an unused file.
 */

/**
 * One alias, for one reason.
 *
 * `src/runtime/app/composables/use-typed-fetch.ts` imports `useFetch` from
 * `#app`, which only exists inside a Nuxt **app** build — so under a plain
 * `vitest run` the module cannot be loaded at all, and the SSR header merge
 * would be reachable only through a full e2e build. That is where its
 * end-to-end proof lives (`test/e2e/specifiers.test.ts`, on a route outside
 * `/api/**`), but a build per input shape is not a proportionate way to check
 * what a merge does with a tuple array.
 *
 * The double records what the wrapper hands vanilla and returns it, which is
 * exactly the boundary the merge is a claim about. Confining it to `unit` is
 * the point: anything importing `#app` under `vitest` would get the double
 * silently, and the two tiers that build a real app must see the real thing.
 */
const nuxtAppDouble = {
  find: /^#app$/,
  replacement: fileURLToPath(
    new URL('./test/doubles/nuxt-app.ts', import.meta.url)
  ),
}

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
        },
        resolve: { alias: [nuxtAppDouble] },
      },
      {
        test: {
          name: 'types',
          include: ['test/types/**/*.test.ts'],
          testTimeout: 60_000,
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['test/e2e/**/*.test.ts'],
          testTimeout: 120_000,
        },
      },
    ],
  },
})
