import { defineConfig } from 'vitest/config'

// Three tiers, mirroring the sibling: `unit` is fast, `types` suites are
// asserted by the compiler under `typecheck`, and `e2e` works against real
// built artifacts. The `include` patterns also feed knip's entry points.

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
        },
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
