import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

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
