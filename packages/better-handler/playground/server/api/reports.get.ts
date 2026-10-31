import { z } from 'zod'
import { pagination, sorting } from '~~/server/io/schemas'

/**
 * `/api/reports?page=1&sort=asc&report=sales` - composition: a tuple on one
 * source, each schema parsing the whole query, whose outputs arrive as one
 * value. Every element's issues arrive together.
 */
export default defineBetterEventHandler(
  {
    input: {
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
