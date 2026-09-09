import { fetch, setup } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { theValidationWire } from './validation-wire'

// The wire against a real production build; the contract itself lives in
// `validation-wire.ts`. The playground is the fixture because it consumes the
// module through its real published specifiers - which is why this package's
// `turbo.json` gives `test` a dependency on its own `build`.
describe('the validation wire, against a production build', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../../playground', import.meta.url)),
    server: true,
    browser: false,
  })

  // Nothing extra: the production error body is exactly what this package and
  // Nitro's own envelope put there.
  theValidationWire({})

  // The other half of the dev-only check: a production build runs no schema on
  // a response, so the same route that answers `500` under `wire-dev.test.ts`
  // sends its mismatched value here, untouched.
  it('sends a response its declared output rejects, unchecked', async () => {
    const response = await fetch('/api/mismatched')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ id: 42 })
  })
})
