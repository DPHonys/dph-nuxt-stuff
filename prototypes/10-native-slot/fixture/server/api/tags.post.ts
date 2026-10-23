import { defineBetterEventHandler } from '../../../lib/handler'
import { schema } from '../../../lib/schema'

// Array body: Nuxt's extractor answers never (Iterable).
export default defineBetterEventHandler(
  { input: { body: schema<string[]>() } },
  (_event, { body }) => ({ count: body.length })
)
