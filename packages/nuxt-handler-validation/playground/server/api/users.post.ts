import { z } from 'zod'

/**
 * A bad body - or, with a non-JSON payload, the unparseable-body failure. Two
 * fields, so one request proves every issue in a source arrives together.
 */
export default defineValidatedEventHandler(
  {
    validate: {
      body: z.object({
        name: z.string().min(1, 'name is required'),
        age: z.number().min(18, 'age must be at least 18'),
      }),
    },
  },
  (_event, { body }) => ({ created: body.name, age: body.age })
)
