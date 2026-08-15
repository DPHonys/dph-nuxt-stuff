import { z } from 'zod'
import { pagination, sorting } from '~~/server/validation/schemas'

/**
 * Composition: a **tuple** on one source, mixing two reused schema values with
 * an inline one - and two schema libraries. Every element parses the same raw
 * query, in order, and their outputs arrive as one flat value.
 */
export default defineValidatedEventHandler(
  {
    validate: {
      query: [
        pagination,
        sorting,
        z.object({ report: z.string().min(1, 'report is required') }),
      ],
    },
  },
  (_event, { query }) => ({
    report: query.report,
    page: query.page,
    sort: query.sort,
  })
)
