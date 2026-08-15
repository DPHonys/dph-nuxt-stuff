import { setup } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe } from 'vitest'
import { theValidationWire } from './validation-wire'

/**
 * The wire, against a real **production build**. The playground is the fixture
 * because it consumes the module through its real published specifiers - which
 * is why this package's `turbo.json` gives `test` a dependency on its own
 * `build`.
 *
 * This tier exists for the one promise no unit test can honestly make: the
 * marker never reaches the wire. That is a claim about a serialized HTTP
 * response, so it is asserted against one - and the failure bodies are asserted
 * **whole**, so an unexpected extra key fails rather than passing unnoticed.
 *
 * The contract itself lives in `validation-wire.ts`, in one copy, because
 * `wire-dev.test.ts` runs the same one against a dev server.
 */
describe('the validation wire, against a production build', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../../playground', import.meta.url)),
    server: true,
    browser: false,
  })

  // Nothing extra: the production error body is exactly what this package and
  // Nitro's own envelope put there.
  theValidationWire({})
})
