import { z } from 'zod'
import {
  defineError,
  defineTypedEventHandler,
} from '../../../../../../src/runtime/server'

const notFound = defineError('user-not-found', {
  status: 404,
  payload: z.object({ userId: z.string() }),
})

/** `errors` only: a branded errors entry, and nothing declared to send. */
export default defineTypedEventHandler(
  {
    errors: [notFound],
  },
  (event, { errors }) => {
    const id = event.context.params?.id ?? ''

    if (id === '') throw errors['user-not-found']({ userId: id })

    return { id, name: 'Ada' }
  }
)
