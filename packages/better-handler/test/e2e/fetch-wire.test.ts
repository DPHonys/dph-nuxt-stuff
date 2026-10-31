import { setup } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe } from 'vitest'
import { theFetchWire } from './fetch-wire'

describe('the fetch family’s wire, against a production build', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/fetch', import.meta.url)),
    server: true,
    browser: false,
  })

  theFetchWire()
})
