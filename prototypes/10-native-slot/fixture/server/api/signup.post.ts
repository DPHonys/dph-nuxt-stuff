import { z } from 'zod'
import { defineBetterEventHandler } from '../../../lib/handler'

// zod object body with a transform: input string, output number.
export default defineBetterEventHandler(
  {
    input: {
      body: z.object({ email: z.email(), age: z.string().transform(Number) }),
    },
  },
  (_event, { body }) => ({ email: body.email, next: body.age + 1 })
)
