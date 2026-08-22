import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Three tiers, as in both parents: `unit` is fast, `types` suites are
// asserted by the compiler under `typecheck`, and `e2e` builds real apps. The
// `include` patterns also feed knip's entry points.

// The channel-token alias only resolves inside a real build, so `unit`
// aliases it to a double. Scoped to `unit` on purpose: the e2e tier must see
// the real thing. The parents' internals are imported for real.
const aliases = [
  {
    find: /^#nuxt-typed-handler\/channel-token$/,
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
          // Every file here works against a real build directory - run in
          // parallel they race over the same `dist` and `.nuxt`.
          fileParallelism: false,
        },
      },
    ],
  },
})
