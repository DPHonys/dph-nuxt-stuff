import { setup } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe, expect } from 'vitest'
import { theInputWire } from './io-wire'

// The same wire against a dev server. A separate file rather than a second
// `describe` because `@nuxt/test-utils` keeps one global test context.
describe('the input wire, against a dev server', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/io', import.meta.url)),
    server: true,
    browser: false,
    dev: true,
  })

  // Nitro's dev error handler adds a `stack` of its own to the JSON body:
  // the framework's key, declared rather than relaxed away.
  theInputWire({ stack: expect.any(Array) })
})
