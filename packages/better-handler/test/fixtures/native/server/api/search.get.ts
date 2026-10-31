import { defineBetterEventHandler } from '@dphonys/better-handler/server'
import { z } from 'zod'

// A coerce query: zod's coerce input is `unknown`, which no query value is.
export default defineBetterEventHandler(
  {
    input: {
      query: z.object({ q: z.string(), page: z.coerce.number().optional() }),
    },
  },
  (_event, { query }) => ({ q: query.q, page: query.page ?? 1 })
)
