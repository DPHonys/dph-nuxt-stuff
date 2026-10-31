import { z } from 'zod'
import { defineBetterEventHandler } from '../../../../../src/runtime/server'

/**
 * The body source, with two fields so one request proves every issue in a
 * source arrives together - or, with a payload that is no JSON, the
 * unparseable-body failure.
 */
export default defineBetterEventHandler(
  {
    input: {
      query: z.object({ dryRun: z.enum(['yes', 'no']).optional() }),
      body: z.object({
        name: z.string().min(1, 'name is required'),
        age: z.number().min(18, 'age must be at least 18'),
      }),
    },
  },
  (_event, { body }) => ({ created: body.name, age: body.age })
)
