import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('an app with the module installed', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/basic', import.meta.url)),
  })

  it('builds and serves its page', async () => {
    const html = await $fetch<string>('/')

    expect(html).toContain('<p>better-handler fixture</p>')
  })
})
