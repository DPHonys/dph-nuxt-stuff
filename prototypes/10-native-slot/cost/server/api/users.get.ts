import { defineBetterEventHandler } from '../../../lib/handler'
import { schema } from '../../../lib/schema'

/** All-optional query schema: `query` stays optional on the client. */
export default defineBetterEventHandler(
  { input: { query: schema<{ search?: string; limit?: number }>() } },
  (_event, { query }) => ({ users: [query.search ?? ''] })
)
