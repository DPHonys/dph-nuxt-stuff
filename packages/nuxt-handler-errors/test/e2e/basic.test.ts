import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('starter behavior', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/basic', import.meta.url)),
  })

  it('renders the configured message through SSR', async () => {
    const html = await $fetch('/')

    expect(html).toContain(
      '<p>Configured by the Nuxt Handler Errors test fixture</p>'
    )
  })
})
