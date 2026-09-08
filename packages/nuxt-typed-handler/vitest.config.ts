import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// The build-only specifiers, pointed at the shared doubles by their package
// subpath so the files move without touching this config.
const double = (name: string): string =>
  fileURLToPath(import.meta.resolve(`@dphonys/test-utils/doubles/${name}`))

const aliases = [
  { find: /^#app$/, replacement: double('nuxt-app') },
  { find: /^nitropack\/runtime$/, replacement: double('nitro-runtime') },
  {
    find: /^#nuxt-typed-handler\/channel-token$/,
    replacement: double('channel-token'),
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
          // Each file compiles a real TypeScript program, which a loaded CI runner
          // stretches well past vitest's 5s default.
          testTimeout: 60_000,
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
