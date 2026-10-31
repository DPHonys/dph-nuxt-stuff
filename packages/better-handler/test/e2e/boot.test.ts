import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
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

  it('answers a developer fault with Nitro’s generic 500, never the sentence', async () => {
    // A bug is an unhandled server error: the server log gets the sentence,
    // a production client gets nothing of it.
    const response = await fetch('/api/developer-fault', {
      headers: { accept: 'application/json' },
    })

    expect(response.status).toBe(500)

    const body = await response.json()

    expect(body.message).toBe('Server Error')
    expect(body.data).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain('[better-handler]')
  })
})
