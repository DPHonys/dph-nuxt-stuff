import { defineTypedEventHandler } from '../../../../../../src/runtime/server'
import { userErrors } from '../../errors/users'

/** `errors` only: a branded errors entry, and nothing declared to send. */
export default defineTypedEventHandler(
  { errors: userErrors.pick('user-not-found') },
  (event, { fail }) => {
    const id = event.context.params?.id ?? ''

    if (id === '') return fail('user-not-found', { userId: id })

    return { id, name: 'Ada' }
  }
)
