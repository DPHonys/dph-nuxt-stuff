import { defineBetterEventHandler } from '../../../lib/handler'
import { schema } from '../../../lib/schema'

// Output-only.
export default defineBetterEventHandler(
  { output: schema<{ total: number }>() },
  () => ({ total: 1 })
)
