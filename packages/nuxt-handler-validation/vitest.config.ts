import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Vitest's own default in all but name. Stated because a config file that
  // does not name its tests leaves knip with no entry patterns for this
  // workspace, and `treatConfigHintsAsErrors` then reports every suite in it
  // as an unused file.
  test: { include: ['test/**/*.test.ts'] },
})
