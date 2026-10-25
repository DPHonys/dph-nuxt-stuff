import { setup } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe } from 'vitest'
import { theInputWire } from './io-wire'

describe('the input wire, against a production build', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/io', import.meta.url)),
    server: true,
    browser: false,
  })

  // Nothing extra: the production error body is exactly what this package
  // and Nitro's own envelope put there.
  theInputWire({})
})
