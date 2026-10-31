import { z } from 'zod'
import { defineBetterEventHandler } from '../../../../../../src/runtime/server'

// Imported by relative path rather than auto-imported, so the package's own
// typecheck reads this file as an app's would without a generated `.nuxt`.

/** An order, or the route's Known error for the one that does not exist. */
export default defineBetterEventHandler(
  {
    input: { route: z.object({ id: z.coerce.number().int() }) },
    output: z.object({ id: z.number() }),
    errors: {
      'order-not-found': { status: 404, schema: z.object({ id: z.number() }) },
    },
  },
  (_event, { route, fail }) => {
    if (route.id === 404) throw fail('order-not-found', { id: route.id })

    return { id: route.id }
  }
)
