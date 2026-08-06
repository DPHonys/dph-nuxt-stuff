import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * One alias, for one reason.
 *
 * `src/runtime/app/composables/use-typed-fetch.ts` imports `useFetch` from `#app`, which
 * only exists inside a Nuxt **app** build — so under a plain `vitest run` the
 * module cannot be loaded at all, and the SSR header merge would be
 * reachable only through a full e2e build. That is where its end-to-end proof
 * lives (`test/specifiers.test.ts`, on a route outside `/api/**`), but a build
 * per input shape is not a proportionate way to check what a merge does with a
 * tuple array.
 *
 * The double records what the wrapper hands vanilla and returns it, which is
 * exactly the boundary the merge is a claim about. It is deliberately the only
 * alias here: anything else importing `#app` under `vitest` would get the
 * double silently, so the file it points at is small enough to read in one
 * screen and is imported by the test that uses it.
 */
export default defineConfig({
  // The `include` is Vitest's own default in all but name. Stated because a
  // config file that does not name its tests leaves knip with no entry
  // patterns for this workspace, and `treatConfigHintsAsErrors` then reports
  // every suite in it as an unused file.
  //
  // The timeout is for the compile-fixture suites: a fixture program costs
  // stock TypeScript one to three seconds, and a test that compiles two would
  // flirt with the 5s default on a loaded box.
  test: { include: ['test/**/*.test.ts'], testTimeout: 60_000 },

  resolve: {
    alias: [
      {
        find: /^#app$/,
        replacement: fileURLToPath(
          new URL('./test/doubles/nuxt-app.ts', import.meta.url)
        ),
      },
    ],
  },
})
