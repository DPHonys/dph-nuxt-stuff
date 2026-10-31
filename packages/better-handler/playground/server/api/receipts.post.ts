import { z } from 'zod'
import { receipt, receiptDraft } from '~~/server/io/schemas'

/**
 * `POST /api/receipts` - the map `output` form, answered through `respond`:
 *
 * - `{ "total": 12 }` - `201` with the receipt;
 * - `?dryRun=yes`, the same body - `204`, a status declared `null`, so no
 *   body at all;
 * - `{ "total": 0 }` - `422` `receipt-empty`, a declared error beside it.
 */
export default defineBetterEventHandler(
  {
    input: {
      query: z.object({ dryRun: z.enum(['yes', 'no']).optional() }),
      body: receiptDraft,
    },
    output: { 201: receipt, 204: null },
    errors: { 'receipt-empty': { status: 422 } },
  },
  (_event, { query, body, respond, fail }) => {
    if (query.dryRun === 'yes') return respond(204)
    if (body.total === 0) throw fail('receipt-empty')

    return respond(201, {
      id: 7,
      total: body.total,
      at: new Date(0).toISOString(),
    })
  }
)
