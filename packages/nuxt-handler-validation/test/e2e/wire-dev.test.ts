import { fetch, setup } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { theValidationWire } from './validation-wire'

// The same wire against a dev server. A separate file rather than a second
// `describe` because `@nuxt/test-utils` keeps one global test context: two
// `setup()` calls in one file leave both suites pointing at whichever server
// was created last.
describe('the validation wire, against a dev server', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../../playground', import.meta.url)),
    server: true,
    browser: false,
    dev: true,
  })

  // Nitro's dev error handler adds a `stack` of its own to the JSON body. The
  // framework's key, not this package's, so it is declared rather than relaxed
  // away.
  theValidationWire({ stack: expect.any(Array) })

  // The one thing this server answers differently from a production build: the
  // dev-only check of a response against its declared Response output. The
  // production half is in `wire.test.ts`, against the same route.
  it('refuses a response its declared output rejects, naming the issue', async () => {
    const response = await fetch('/api/mismatched')

    expect(response.status).toBe(500)

    const body = await response.json()

    // No issues payload and no marker: this is a developer mistake, not a
    // client's bad input, so nothing here looks like a validation failure.
    expect(body.data).toBeUndefined()
    expect(body.message).toContain('cannot send the response')
    expect(body.message).toContain('GET /api/mismatched')
    expect(body.message).toContain('answered 200')
    expect(body.message).toContain('id: ')
  })
})
