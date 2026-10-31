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
          // Compiler assertions only: `expectTypeOf` under `tsc`, never run.
          include: [],
          typecheck: {
            enabled: true,
            only: true,
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
