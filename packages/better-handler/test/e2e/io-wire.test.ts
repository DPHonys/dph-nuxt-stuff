import { fetch, setup } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { theInputWire, theOutputWire } from './io-wire'

describe('the io wire, against a production build', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/io', import.meta.url)),
    server: true,
    browser: false,
  })

  // Nothing extra: the production error body is exactly what this package
  // and Nitro's own envelope put there.
  theInputWire({})
  theOutputWire()

  // The other half of the response check: production runs no schema, and
  // sends what the Handler handed over.
  it('sends a response its declared output rejects as it was handed over', async () => {
    const response = await fetch('/api/mismatched-receipt')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ id: 1, total: 'free' })
  })
})
