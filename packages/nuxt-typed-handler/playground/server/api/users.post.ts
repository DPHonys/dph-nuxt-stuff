import { userErrors } from '../errors/users'
import { createUser } from '../validation/schemas'

/** Both halves declared: a rejected body and a declared failure, one route. */
export default defineTypedEventHandler(
  {
    input: { body: createUser },
    errors: userErrors.pick('user-exists'),
  },
  (_event, { body, errors }) => {
    if (body.email === 'taken@example.com') {
      throw errors.userExists({ email: body.email })
    }

    return { created: body.name }
  }
)
