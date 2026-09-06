// `defineCheckedEventHandler` arrives by auto-import, like `defineEventHandler`.
import { z } from 'zod'

const gone = defineError('cGone', {
  status: 404,
  payload: z.object({ resource: z.string() }),
})

export default defineCheckedEventHandler(
  {
    errors: [gone],
  },
  (event, { errors }) => {
    const mode = String(getQuery(event).mode ?? 'ok')

    if (mode !== 'ok') throw errors.cGone({ resource: mode })

    // The caller's request identity, read off this handler's own event.
    return { ok: true, cookie: getCookie(event, 'probe') ?? 'none' }
  }
)
