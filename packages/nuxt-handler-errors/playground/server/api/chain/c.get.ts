// `defineCheckedEventHandler` arrives by auto-import, like `defineEventHandler`.
import { z } from 'zod'

export default defineCheckedEventHandler(
  {
    errors: {
      'c-gone': { status: 404, data: z.object({ resource: z.string() }) },
    },
  },
  (event, { errors }) => {
    const mode = String(getQuery(event).mode ?? 'ok')

    if (mode !== 'ok') throw errors['c-gone']({ resource: mode })

    // The caller's request identity, read off this handler's own event.
    return { ok: true, cookie: getCookie(event, 'probe') ?? 'none' }
  }
)
