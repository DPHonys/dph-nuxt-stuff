import { defineBetterEventHandler } from '@dphonys/better-handler/server'
import { schema } from '../schema'

// A union of records.
export default defineBetterEventHandler(
  {
    input: {
      body: schema<{ kind: 'a'; a: string } | { kind: 'b'; b: number }>(),
    },
  },
  (_event, { body }) => ({ kind: body.kind })
)
