import { defineTypedEventHandler } from '../../../../../src/runtime/server'
import { userErrors } from '../errors/users'
import { createUser, pagination } from '../validation/schemas'

/** Both halves declared: the generated map keys this route in both slots. */
export default defineTypedEventHandler(
  {
    validate: { body: createUser, query: pagination },
    errors: userErrors.pick('user-exists'),
  },
  (_event, { body, query, fail }) => {
    if (body.email === 'taken@example.com') {
      return fail('user-exists', { email: body.email })
    }

    return { created: body.name, page: query.page }
  }
)
