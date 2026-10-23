import { defineBetterEventHandler } from '../../../lib/handler'
import { schema } from '../../../lib/schema'

// Array query input: never on the native path.
export default defineBetterEventHandler(
  { input: { query: schema<string[]>() } },
  (_event, { query }) => ({ n: query.length })
)
