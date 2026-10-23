import { defineBetterEventHandler } from '../../../lib/handler'
import { schema } from '../../../lib/schema'

// Record | array: Shape distributes and keeps only the record branch.
export default defineBetterEventHandler(
  { input: { body: schema<{ a: string } | string[]>() } },
  (_event, { body }) => ({ isArray: Array.isArray(body) })
)
