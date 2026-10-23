import { defineBetterEventHandler } from '../../../lib/handler'
import { schema } from '../../../lib/schema'

// All-optional query.
export default defineBetterEventHandler(
  { input: { query: schema<{ search?: string; limit?: number }>() } },
  (_event, { query }) => ({ users: [query.search ?? ''] })
)
