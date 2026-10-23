import { z } from 'zod'
import { defineBetterEventHandler } from '../../../lib/handler'

// Real library types: zod's coerce input is unknown per key.
export default defineBetterEventHandler(
  {
    input: {
      query: z.object({ q: z.string(), page: z.coerce.number().optional() }),
    },
  },
  (_event, { query }) => ({ q: query.q, page: query.page ?? 1 })
)
