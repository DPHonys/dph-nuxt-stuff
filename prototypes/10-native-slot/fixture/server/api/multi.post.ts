import { defineBetterEventHandler } from '../../../lib/handler'
import { schema } from '../../../lib/schema'

// One of two handlers for (/api/multi, post): Nuxt emits no request types.
export default defineBetterEventHandler(
  { input: { body: schema<{ one: string }>() } },
  (_event, { body }) => ({ one: body.one })
)
