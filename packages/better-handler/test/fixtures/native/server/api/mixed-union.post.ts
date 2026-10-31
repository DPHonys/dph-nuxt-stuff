import { defineBetterEventHandler } from '@dphonys/better-handler/server'
import { schema } from '../schema'

// A union of a record and a non-record.
export default defineBetterEventHandler(
  { input: { body: schema<{ a: string } | string[]>() } },
  (_event, { body }) => ({ isArray: Array.isArray(body) })
)
