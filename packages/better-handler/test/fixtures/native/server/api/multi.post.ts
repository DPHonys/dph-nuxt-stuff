import { defineBetterEventHandler } from '@dphonys/better-handler/server'
import { schema } from '../schema'

// One of two handlers on (/api/multi, post); the other is in `server/extra`.
export default defineBetterEventHandler(
  { input: { body: schema<{ one: string }>() } },
  (_event, { body }) => ({ one: body.one })
)
