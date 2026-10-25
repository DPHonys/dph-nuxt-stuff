import { setup } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe } from 'vitest'
import { theFetchWire } from './fetch-wire'

// The same wire against a dev server. A separate file rather than a second
// `describe` because `@nuxt/test-utils` keeps one global test context.
describe('the fetch family’s wire, against a dev server', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/fetch', import.meta.url)),
    server: true,
    browser: false,
    dev: true,
  })

  theFetchWire()
})
