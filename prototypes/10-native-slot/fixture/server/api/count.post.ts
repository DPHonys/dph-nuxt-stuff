import { defineBetterEventHandler } from '../../../lib/handler'
import { schema } from '../../../lib/schema'

// Primitive body: Nuxt's extractor answers never (not a record).
export default defineBetterEventHandler(
  { input: { body: schema<number>() } },
  (_event, { body }) => ({ doubled: body * 2 })
)
