import { fetch, setup } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { theErrorsWire } from './errors-wire'

// The same wire against a dev server. A separate file rather than a second
// `describe` because `@nuxt/test-utils` keeps one global test context: two
// `setup()` calls in one file leave both suites pointing at whichever server
// was created last.
describe('the Known-error wire, against a dev server', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/errors', import.meta.url)),
    server: true,
    browser: false,
    dev: true,
  })

  // Nitro's dev error handler adds a `stack` of its own to the JSON body. The
  // framework's key, not this package's, so it is declared rather than relaxed
  // away.
  theErrorsWire({ stack: expect.any(Array) })

  // What this server answers differently from a production build: both
  // development checks. A developer's mistake, so a plain `500` with no
  // `data` - nothing here looks like a Known error.
  it('refuses thrown fields the schema rejects, naming route, tag and issue', async () => {
    const response = await fetch('/api/mismatched')

    expect(response.status).toBe(500)

    const body = await response.json()

    expect(body.data).toBeUndefined()
    expect(body.message).toContain(
      '[better-handler] cannot send the error: GET /api/mismatched threw "order-not-found" with fields its declared schema rejects - id: '
    )
  })

  it('refuses a value with an undeclared _tag, naming it and the declared ones', async () => {
    const response = await fetch('/api/undeclared')

    expect(response.status).toBe(500)

    const body = await response.json()

    expect(body.data).toBeUndefined()
    expect(body.message).toContain(
      'GET /api/undeclared threw a value tagged "order-paid", which this route does not declare - it declares "order-not-found".'
    )
  })
})
