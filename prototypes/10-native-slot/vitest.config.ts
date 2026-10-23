// PROTOTYPE (ticket 10): the *.spec-d.ts files as a vitest typecheck run,
// against the flag-on (ROUTE_TYPED_FETCH=1) or flag-off app program.
import { defineConfig } from 'vitest/config'

const mode = process.env.ROUTE_TYPED_FETCH === '1' ? 'on' : 'off'

export default defineConfig({
  test: {
    typecheck: {
      enabled: true,
      only: true,
      include: ['fixture/checks/both/**/*.spec-d.ts'],
      tsconfig: `fixture/tsconfig.${mode}.json`,
    },
  },
})
