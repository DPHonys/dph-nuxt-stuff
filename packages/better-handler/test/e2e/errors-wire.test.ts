import { fetch, setup } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { theErrorsWire } from './errors-wire'

describe('the Known-error wire, against a production build', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/errors', import.meta.url)),
    server: true,
    browser: false,
  })

  // Nothing extra: the production error body is exactly what this package and
  // Nitro's own envelope put there.
  theErrorsWire({})

  // The other half of both development checks: production runs neither, and
  // sends what the Handler threw.
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

    // An unhandled error, as any other throw: Nitro sends none of it.
    expect(body.message).toBe('Server Error')
    expect(body.data).toBeUndefined()
  })
})
