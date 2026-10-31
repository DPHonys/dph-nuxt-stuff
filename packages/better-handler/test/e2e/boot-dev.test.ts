import { fetch, setup } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('an app with the module installed, on a development server', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/basic', import.meta.url)),
    server: true,
    browser: false,
    dev: true,
  })

  it('shows the developer a developer fault’s sentence', async () => {
    // The other half of the generic production 500: an unhandled error's
    // message still reaches a development client, beside its stack.
    const response = await fetch('/api/developer-fault', {
      headers: { accept: 'application/json' },
    })

    expect(response.status).toBe(500)

    const body = await response.json()

    expect(body.message).toBe(
      '[better-handler] fail("order-unknown") names no error this route declares. The route declares "order-locked".'
    )
    expect(body.data).toBeUndefined()
  })
})
