import { defineBetterEventHandler } from '../../../lib/handler'
import { schema } from '../../../lib/schema'

// String body: never on the native path (a string is Iterable).
export default defineBetterEventHandler(
  { input: { body: schema<string>() } },
  (_event, { body }) => ({ length: body.length })
)
