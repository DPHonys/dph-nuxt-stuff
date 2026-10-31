import { fetch, setup } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { theInputWire, theOutputWire } from './io-wire'

// The same wire against a dev server. A separate file rather than a second
// `describe` because `@nuxt/test-utils` keeps one global test context.
describe('the io wire, against a dev server', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/io', import.meta.url)),
    server: true,
    browser: false,
    dev: true,
  })

  // Nitro's dev error handler adds a `stack` of its own to the JSON body:
  // the framework's key, declared rather than relaxed away.
  theInputWire({ stack: expect.any(Array) })
  theOutputWire()

  // What this server answers differently from a production build: the
  // response check. A developer's mistake, so a plain `500` with no `data`.
  it('refuses a response its declared output rejects, naming route, status and issues', async () => {
    const response = await fetch('/api/mismatched-receipt')

    expect(response.status).toBe(500)

    const body = await response.json()

    expect(body.data).toBeUndefined()
    expect(body.message).toContain(
      '[better-handler] cannot send the response: GET /api/mismatched-receipt answered 200 with a value its declared Response output rejects - id: '
    )
  })
})
