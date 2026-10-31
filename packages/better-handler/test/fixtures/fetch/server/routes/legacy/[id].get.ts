import { z } from 'zod'
import { defineBetterEventHandler } from '../../../../../../src/runtime/server'

/**
 * The same order outside `/api/**`, where Nitro answers an error as JSON only
 * to a request that asks for JSON: the reason the fetch family sends
 * `accept: application/json`.
 */
export default defineBetterEventHandler(
  {
    input: { route: z.object({ id: z.coerce.number().int() }) },
    errors: {
      'order-not-found': { status: 404, schema: z.object({ id: z.number() }) },
    },
  },
  (_event, { route, fail }) => {
    if (route.id === 404) throw fail('order-not-found', { id: route.id })

    return { id: route.id }
  }
)
