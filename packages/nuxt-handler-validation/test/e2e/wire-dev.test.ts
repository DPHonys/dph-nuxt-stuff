import { setup } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe, expect } from 'vitest'
import { theValidationWire } from './validation-wire'

/**
 * The same wire, against a **dev server** - the other half of "identical in
 * development and production", which is a promise about a running app and not
 * about a config flag.
 *
 * It is a separate file rather than a second `describe` because
 * `@nuxt/test-utils` keeps one global test context: two `setup()` calls in one
 * file leave both suites pointing at whichever server was created last. The
 * `e2e` project runs with `fileParallelism: false`, so this suite and the
 * production one take their turns over the playground's build directory.
 */
describe('the validation wire, against a dev server', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../../playground', import.meta.url)),
    server: true,
    browser: false,
    dev: true,
  })

  // Nitro's dev error handler adds a `stack` of its own to the JSON body. It is
  // the framework's key, not this package's, so it is declared here rather than
  // relaxed away - every other key is asserted against the same expectations
  // the production build is.
  theValidationWire({ stack: expect.any(Array) })
})
