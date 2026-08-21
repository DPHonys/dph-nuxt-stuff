import { schema } from '../lib/schema'
import { defineTypedEventHandler } from '../lib/typed-handler'

/** All-optional query schema: `query` stays optional on the client. */
export default defineTypedEventHandler(
  { validate: { query: schema<{ search?: string; limit?: number }>() } },
  (_event, { query }) => ({ users: [query.search ?? ''] })
)
