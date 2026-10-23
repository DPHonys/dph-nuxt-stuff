import { defineBetterEventHandler } from '../../../lib/handler'
import { schema } from '../../../lib/schema'

// The second handler for (/api/multi, post).
export default defineBetterEventHandler(
  { input: { body: schema<{ two: number }>() } },
  (_event, { body }) => ({ two: body.two })
)
