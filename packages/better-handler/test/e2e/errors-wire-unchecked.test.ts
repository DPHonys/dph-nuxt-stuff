import { fetch, setup } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// A dev server with `devChecks: false`: the module registers the Nitro plugin
// that turns both development checks off, and the server then answers as a
// production build does.
describe('a dev server with the development checks turned off', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/errors', import.meta.url)),
    server: true,
    browser: false,
    dev: true,
    nuxtConfig: { betterHandler: { devChecks: false } },
  })

  it('sends thrown fields the schema rejects as they were thrown', async () => {
    const response = await fetch('/api/mismatched')

    expect(response.status).toBe(404)
    expect((await response.json()).data).toEqual({
      _tag: 'order-not-found',
      id: 'seven',
    })
  })

  it('lets a value with an undeclared _tag propagate untouched', async () => {
    const response = await fetch('/api/undeclared')

    expect(response.status).toBe(500)

    const body = await response.json()

    expect(body.message).not.toContain('[better-handler]')
    expect(body.data).toBeUndefined()
  })
})
