import { defineBetterEventHandler } from '../../../lib/handler'
import { schema } from '../../../lib/schema'

// Index-signature record body.
export default defineBetterEventHandler(
  { input: { body: schema<Record<string, number>>() } },
  (_event, { body }) => ({ keys: Object.keys(body).length })
)
