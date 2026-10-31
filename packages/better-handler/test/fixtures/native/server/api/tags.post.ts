import { defineBetterEventHandler } from '@dphonys/better-handler/server'
import { schema } from '../schema'

// An array body: Nuxt's extractor reads records only.
export default defineBetterEventHandler(
  { input: { body: schema<string[]>() } },
  (_event, { body }) => ({ count: body.length })
)
