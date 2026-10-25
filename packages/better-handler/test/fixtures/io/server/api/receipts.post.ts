import { z } from 'zod'
import { defineBetterEventHandler } from '../../../../../src/runtime/server'
import { receipt } from '../io/schemas'

/**
 * The map form: `201` with the receipt, or `204` with no body for a dry run.
 */
export default defineBetterEventHandler(
  {
    input: { query: z.object({ dryRun: z.enum(['yes', 'no']).optional() }) },
    output: { 201: receipt, 204: null },
  },
  (_event, { query, respond }) =>
    query.dryRun === 'yes'
      ? respond(204)
      : respond(201, { id: 'r-2', total: 5 })
)
