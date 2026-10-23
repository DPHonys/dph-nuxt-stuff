import { defineBetterEventHandler } from '../../../lib/handler'
import { schema } from '../../../lib/schema'

// Headers only: h3 v1 has no headers slot, so the native slot is empty.
export default defineBetterEventHandler(
  { input: { headers: schema<{ 'x-tenant': string }>() } },
  (_event, { headers }) => ({ tenant: headers['x-tenant'] })
)
