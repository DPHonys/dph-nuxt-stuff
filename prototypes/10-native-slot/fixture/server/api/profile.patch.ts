import { defineBetterEventHandler } from '../../../lib/handler'
import { schema } from '../../../lib/schema'

// All-optional object body.
export default defineBetterEventHandler(
  { input: { body: schema<{ name?: string; bio?: string }>() } },
  (_event, { body }) => ({ name: body.name ?? '' })
)
