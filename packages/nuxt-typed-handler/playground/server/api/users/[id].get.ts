import { z } from 'zod'

/** The errors parent's smoke: an `errors`-only route, byte for byte the parent's. */
export default defineTypedEventHandler(
  {
    errors: {
      'user-not-found': { status: 404, data: z.object({ userId: z.string() }) },
    },
  },
  (event, { errors }) => {
    const userId = event.context.params?.id ?? ''

    if (userId === 'missing') throw errors['user-not-found']({ userId })

    return { id: userId, name: `User ${userId}` }
  }
)
