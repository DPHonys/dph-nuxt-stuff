import { defineBetterEventHandler } from '@dphonys/better-handler/server'
import { schema } from '../schema'

// An all-optional query.
export default defineBetterEventHandler(
  { input: { query: schema<{ search?: string; limit?: number }>() } },
  (_event, { query }) => ({ users: [query.search ?? ''] })
)
