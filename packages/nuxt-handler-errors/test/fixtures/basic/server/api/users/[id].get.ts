import { z } from 'zod'
import {
  defineCheckedEventHandler,
  defineError,
} from '../../../../../../src/runtime/server'

const userErrors = defineError({
  'user-not-found': { status: 404, payload: z.object({ userId: z.string() }) },
  'user-suspended': { status: 403, payload: z.object({ until: z.string() }) },
})

// A checked route, so the generated map has a branded entry to key. Imported
// by relative path: one module instance keeps the brand's private symbol
// comparable.
export default defineCheckedEventHandler(
  {
    errors: [...userErrors],
  },
  (event, { errors }) => {
    const id = event.context.params?.id ?? ''

    if (id === '') throw errors['user-not-found']({ userId: id })

    return { id, name: 'Ada' }
  }
)
