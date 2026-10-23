import { z } from 'zod'
import {
  defineError,
  defineTypedEventHandler,
} from '../../../../../src/runtime/server'
import { createUser, pagination } from '../validation/schemas'

const userErrors = defineError({
  'user-exists': { status: 409, payload: z.object({ email: z.string() }) },
})

/** Both halves declared: the generated map keys this route in both slots. */
export default defineTypedEventHandler(
  {
    input: { body: createUser, query: pagination },
    errors: [...userErrors],
  },
  (_event, { body, query, errors }) => {
    if (body.email === 'taken@example.com') {
      throw errors.userExists({ email: body.email })
    }

    return { created: body.name, page: query.page }
  }
)
