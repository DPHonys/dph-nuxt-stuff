import { z } from 'zod'
import { defineTypedEventHandler } from '../../../../../../src/runtime/server'

/** `errors` only: a branded errors entry, and nothing declared to send. */
export default defineTypedEventHandler(
  {
    errors: {
      'user-not-found': { status: 404, data: z.object({ userId: z.string() }) },
    },
  },
  (event, { errors }) => {
    const id = event.context.params?.id ?? ''

    if (id === '') throw errors['user-not-found']({ userId: id })

    return { id, name: 'Ada' }
  }
)
