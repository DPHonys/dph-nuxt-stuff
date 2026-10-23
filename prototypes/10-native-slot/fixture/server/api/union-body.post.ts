import { defineBetterEventHandler } from '../../../lib/handler'
import { schema } from '../../../lib/schema'

// Union of records: both survive Nuxt's Shape.
export default defineBetterEventHandler(
  {
    input: {
      body: schema<{ kind: 'a'; a: string } | { kind: 'b'; b: number }>(),
    },
  },
  (_event, { body }) => ({ kind: body.kind })
)
