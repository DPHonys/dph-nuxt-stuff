import { defineBetterEventHandler } from '../../../../../src/runtime/server'
import { pagination, sorting } from '../io/schemas'

/** Composition: a tuple on one source, whose outputs arrive as one value. */
export default defineBetterEventHandler(
  { input: { query: [pagination, sorting] } },
  (_event, { query }) => ({ page: query.page, sort: query.sort })
)
