import { defineBetterEventHandler } from '@dphonys/better-handler/server'
import { schema } from '../schema'

// An all-optional body.
export default defineBetterEventHandler(
  { input: { body: schema<{ name?: string; bio?: string }>() } },
  (_event, { body }) => ({ name: body.name ?? '' })
)
