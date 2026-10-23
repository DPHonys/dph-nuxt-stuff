import { defineBetterEventHandler } from '../../../lib/handler'
import { schema } from '../../../lib/schema'

// Errors-only: no input, no validation.
export default defineBetterEventHandler(
  {
    errors: {
      'thing-missing': { status: 404, schema: schema<{ id: number }>() },
    },
  },
  (_event, { fail }) => {
    throw fail('thing-missing', { id: 1 })
  }
)
