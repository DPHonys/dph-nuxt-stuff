import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Three projects, because the suites here cost very different things and a
 * single config has to price them all at the worst case: `unit` is the fast
 * tier, `types` holds suites whose real assertions the compiler makes (they
 * run under `typecheck`, and each file's runtime half is a marker), and `e2e`
 * builds real apps — minutes, not seconds.
 *
 * Each project names its `include`. That is also what keeps knip supplied with
 * entry patterns for this workspace.
 */

/**
 * Two aliases, both for the same reason and both scoped to `unit`.
 *
 * `src/runtime/app/**` imports `#app` and `src/runtime/server/plugins/**`
 * imports `nitropack/runtime`; neither specifier resolves outside a real build,
 * so under a plain `vitest run` those modules cannot be loaded at all and their
 * header merges would be reachable only through a full e2e build. The doubles
 * record what the wrapper hands the framework, which is exactly the boundary
 * those merges are a claim about.
 *
 * Confining them to `unit` is the point: anything importing `#app` under
 * `vitest` would get the double silently, and the tier that builds a real app
 * must see the real thing.
 */
const aliases = [
  {
    find: /^#app$/,
    replacement: fileURLToPath(
      new URL('./test/doubles/nuxt-app.ts', import.meta.url)
    ),
  },
  {
    find: /^nitropack\/runtime$/,
    replacement: fileURLToPath(
      new URL('./test/doubles/nitro-runtime.ts', import.meta.url)
    ),
  },
]

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
        },
        resolve: { alias: aliases },
      },
      {
        test: {
          name: 'types',
          include: ['test/types/**/*.test.ts'],
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
