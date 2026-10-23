import { defineBetterEventHandler } from '../../../lib/handler'
import { schema } from '../../../lib/schema'

// unknown body: Shape answers never; our map keeps unknown.
export default defineBetterEventHandler(
  { input: { body: schema<unknown>() } },
  () => ({ ok: true })
)
