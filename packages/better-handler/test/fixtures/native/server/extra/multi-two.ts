import { defineBetterEventHandler } from '@dphonys/better-handler/server'
import { schema } from '../schema'

// The second handler on (/api/multi, post), registered in `nuxt.config.ts`.
export default defineBetterEventHandler(
  { input: { body: schema<{ two: number }>() } },
  (_event, { body }) => ({ two: body.two })
)
