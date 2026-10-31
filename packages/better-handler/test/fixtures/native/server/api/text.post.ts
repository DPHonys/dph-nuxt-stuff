import { defineBetterEventHandler } from '@dphonys/better-handler/server'
import { schema } from '../schema'

// A string body: Nuxt's extractor reads records only.
export default defineBetterEventHandler(
  { input: { body: schema<string>() } },
  (_event, { body }) => ({ length: body.length })
)
