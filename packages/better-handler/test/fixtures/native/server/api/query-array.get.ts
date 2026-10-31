import { defineBetterEventHandler } from '@dphonys/better-handler/server'
import { schema } from '../schema'

// An array query.
export default defineBetterEventHandler(
  { input: { query: schema<string[]>() } },
  (_event, { query }) => ({ n: query.length })
)
