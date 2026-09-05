import { z } from 'zod'
import { defineCheckedEventHandler } from '../../../../../../src/runtime/server'

// A checked route, so the generated map has a branded entry to key. Imported
// by relative path: one module instance keeps the brand's private symbol
// comparable.
export default defineCheckedEventHandler(
  {
    errors: {
      'user-not-found': { status: 404, data: z.object({ userId: z.string() }) },
      'user-suspended': { status: 403, data: z.object({ until: z.string() }) },
    },
  },
  (event, { errors }) => {
    const id = event.context.params?.id ?? ''

    if (id === '') throw errors['user-not-found']({ userId: id })

    return { id, name: 'Ada' }
  }
)
