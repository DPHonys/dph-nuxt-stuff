import { setup } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe } from 'vitest'
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
})
