import { defineBetterEventHandler } from '@dphonys/better-handler/server'
import { schema } from '../schema'

// An index-signature body.
export default defineBetterEventHandler(
  { input: { body: schema<Record<string, number>>() } },
  (_event, { body }) => ({ keys: Object.keys(body).length })
)
