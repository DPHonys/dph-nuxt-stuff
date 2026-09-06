import { userErrors } from '../../errors/users'

/** The errors parent's smoke: an `errors`-only route, byte for byte the parent's. */
export default defineTypedEventHandler(
  {
    errors: userErrors.pick('userNotFound'),
  },
  (event, { errors }) => {
    const userId = event.context.params?.id ?? ''

    if (userId === 'missing') throw errors.userNotFound({ userId })

    return { id: userId, name: `User ${userId}` }
  }
)
