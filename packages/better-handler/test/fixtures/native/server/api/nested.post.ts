import { defineBetterEventHandler } from '@dphonys/better-handler/server'
import { schema } from '../schema'

// Nested records and an optional nested key.
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
