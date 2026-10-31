import { z } from 'zod'

/**
 * `POST /api/users` - the body source. Two fields, so one request shows every
 * issue in a source arriving together; a payload that is no JSON answers one
 * body issue, `Request body could not be parsed`.
 */
export default defineBetterEventHandler(
  {
    input: {
      body: z.object({
        name: z.string().min(1, 'name is required'),
        age: z.number().min(18, 'age must be at least 18'),
      }),
    },
  },
  (_event, { body }) => ({ created: body.name, age: body.age })
)
