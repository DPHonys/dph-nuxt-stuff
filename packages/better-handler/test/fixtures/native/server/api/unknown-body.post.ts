import { defineBetterEventHandler } from '@dphonys/better-handler/server'
import { schema } from '../schema'

// A body of any value, `undefined` included.
export default defineBetterEventHandler(
  { input: { body: schema<unknown>() } },
  () => ({ ok: true })
)
