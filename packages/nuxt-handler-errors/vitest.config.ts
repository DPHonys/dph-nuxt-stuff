import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Three tiers: `unit` is fast, `types` suites are asserted by the compiler
// under `typecheck`, and `e2e` builds real apps. The `include` patterns also
// feed knip's entry points.

// These specifiers only resolve inside a real build, so `unit` aliases them
// to doubles. Scoping the aliases to `unit` is deliberate: the e2e tier must
// see the real thing.
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
  {
    find: /^#nuxt-handler-errors\/channel-token$/,
    replacement: fileURLToPath(
      new URL('./test/doubles/channel-token.ts', import.meta.url)
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
          // Every file here writes into a real app's build directory - one
          // prepares the playground and edits its emitted map, another builds
          // and boots it. Run in parallel they race over the same `.nuxt`.
          fileParallelism: false,
        },
      },
    ],
  },
})
