import { defineBetterEventHandler } from '@dphonys/better-handler/server'
import { schema } from '../schema'

// Errors only: no source declared, nothing validated.
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
