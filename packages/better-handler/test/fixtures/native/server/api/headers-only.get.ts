import { defineBetterEventHandler } from '@dphonys/better-handler/server'
import { schema } from '../schema'

// Headers only: h3 v1 describes no headers, so the slot stays empty.
export default defineBetterEventHandler(
  { input: { headers: schema<{ 'x-tenant': string }>() } },
  (_event, { headers }) => ({ tenant: headers['x-tenant'] })
)
