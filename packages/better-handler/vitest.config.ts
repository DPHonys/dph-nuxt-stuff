import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
          // Each file boots a real Nuxt through `loadNuxt`.
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
      {
        test: {
          name: 'types',
          // Two kinds of compiler assertion: `expectTypeOf` under `tsc` in
          // the `*.spec-d.ts` files, never run, and the `*.test.ts` files that
          // compile a fixture through the harness and read its diagnostics.
          include: ['test/types/**/*.test.ts'],
          // Each harness file compiles a real TypeScript program, which a
          // loaded CI runner stretches well past vitest's 5s default.
          testTimeout: 60_000,
          typecheck: {
            enabled: true,
            include: ['test/types/**/*.spec-d.ts'],
            tsconfig: './tsconfig.json',
          },
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['test/e2e/**/*.test.ts'],
          testTimeout: 120_000,
          hookTimeout: 120_000,
          // Every file here works against a real build directory - run in
          // parallel they race over the same `dist` and `.nuxt`.
          fileParallelism: false,
        },
      },
    ],
  },
})
