import { z } from 'zod'
import { defineTypedEventHandler } from '../../../../../src/runtime/server'
import { createUser, pagination } from '../validation/schemas'

/** Both halves declared: the generated map keys this route in both slots. */
export default defineTypedEventHandler(
  {
    validate: { body: createUser, query: pagination },
    errors: {
      'user-exists': { status: 409, data: z.object({ email: z.string() }) },
    },
  },
  (_event, { body, query, errors }) => {
    if (body.email === 'taken@example.com') {
      throw errors['user-exists']({ email: body.email })
    }

    return { created: body.name, page: query.page }
  }
)
