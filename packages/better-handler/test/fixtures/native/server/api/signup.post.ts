import { defineBetterEventHandler } from '@dphonys/better-handler/server'
import { z } from 'zod'

// A zod body whose transform changes the type.
export default defineBetterEventHandler(
  {
    input: {
      body: z.object({ email: z.email(), age: z.string().transform(Number) }),
    },
  },
  (_event, { body }) => ({ email: body.email, next: body.age + 1 })
)
