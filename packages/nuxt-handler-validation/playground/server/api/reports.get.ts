import { z } from 'zod'
import { pagination, sorting } from '~~/server/validation/schemas'

/** Composition: a tuple on one source, whose outputs arrive as one value. */
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
