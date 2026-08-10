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
        },
      },
    ],
  },
})
