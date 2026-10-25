import { defineBetterEventHandler } from '../../../../../src/runtime/server'
import { pagination } from '../io/schemas'

/** The query source alone: `validation-failed` is the route's whole union. */
export default defineBetterEventHandler(
  { input: { query: pagination } },
  (_event, { query }) => ({ page: query.page })
)
