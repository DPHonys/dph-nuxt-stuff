import { setup } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe, expect } from 'vitest'
import { theTypedWire } from './typed-wire'

// The same wire against a dev server. A separate file rather than a second
// `describe` because `@nuxt/test-utils` keeps one global test context: two
// `setup()` calls in one file leave both suites pointing at whichever server
// was created last.
describe('the typed wire, against a dev server', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../../playground', import.meta.url)),
    server: true,
    browser: false,
    dev: true,
  })

  // Nitro's dev error handler adds a `stack` of its own to the JSON body. The
  // framework's key, not this package's, so it is declared rather than
  // relaxed away.
  theTypedWire({ stack: expect.any(Array) })
})
