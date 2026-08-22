import { userErrors } from '../errors/users'
import { createUser } from '../validation/schemas'

/** Both halves declared: a rejected body and a declared failure, one route. */
export default defineTypedEventHandler(
  { validate: { body: createUser }, errors: userErrors.pick('user-exists') },
  (_event, { body, fail }) => {
    if (body.email === 'taken@example.com') {
      return fail('user-exists', { email: body.email })
    }

    return { created: body.name }
  }
)
