import { defineBetterEventHandler } from '@dphonys/better-handler/server'
import { schema } from '../schema'

// A body admitting undefined.
export default defineBetterEventHandler(
  { input: { body: schema<{ a: string } | undefined>() } },
  (_event, { body }) => ({ a: body?.a ?? '' })
)
