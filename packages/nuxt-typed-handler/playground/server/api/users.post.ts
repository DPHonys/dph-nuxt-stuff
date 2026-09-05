import { z } from 'zod'
import { createUser } from '../validation/schemas'

/** Both halves declared: a rejected body and a declared failure, one route. */
export default defineTypedEventHandler(
  {
    validate: { body: createUser },
    errors: {
      'user-exists': { status: 409, data: z.object({ email: z.string() }) },
    },
  },
  (_event, { body, errors }) => {
    if (body.email === 'taken@example.com') {
      throw errors['user-exists']({ email: body.email })
    }

    return { created: body.name }
  }
)
