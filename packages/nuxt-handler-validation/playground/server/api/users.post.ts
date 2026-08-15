import { z } from 'zod'

/**
 * A bad body - and, reached with a payload that is not JSON at all, the
 * unparseable-body failure, which answers in the same shape rather than as a
 * special case a client must detect differently.
 *
 * Two fields, so one request can prove that every issue **within** one source
 * arrives together.
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
