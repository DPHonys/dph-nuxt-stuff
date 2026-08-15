import { z } from 'zod'
import { pagination, sorting } from '~~/server/validation/sets'

/**
 * Composition: a named set, an unnamed set and an inline fragment, all
 * declaring `query`. Every one of them runs against the same raw query, and
 * their outputs arrive as one value - the named set under its own name, the
 * rest flat.
 */
export default defineValidatedEventHandler(
  [
    ...pagination,
    ...sorting,
    { query: z.object({ report: z.string().min(1, 'report is required') }) },
  ],
  (_event, { query }) => ({
    report: query.report,
    // The named set's output, nested - and typed as exactly that set's schema
    // output, so it could be handed whole to a helper typed off the same one.
    page: query.pagination.page,
    // The unnamed set's, flat.
    sort: query.sort,
  })
)
