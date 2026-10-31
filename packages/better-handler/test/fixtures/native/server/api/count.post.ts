import { defineBetterEventHandler } from '@dphonys/better-handler/server'
import { schema } from '../schema'

// A number body: Nuxt's extractor reads records only.
export default defineBetterEventHandler(
  { input: { body: schema<number>() } },
  (_event, { body }) => ({ doubled: body * 2 })
)
