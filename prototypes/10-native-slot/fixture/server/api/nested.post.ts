import { defineBetterEventHandler } from '../../../lib/handler'
import { schema } from '../../../lib/schema'

// Nested records and optional nested keys.
export default defineBetterEventHandler(
  {
    input: {
      body: schema<{
        user: { name: string; address?: { city: string } }
        ids: number[]
      }>(),
    },
  },
  (_event, { body }) => ({ name: body.user.name })
)
