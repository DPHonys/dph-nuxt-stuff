import { defineCheckedEventHandler } from '@dphonys/nuxt-handler-errors/server'
import { chainErrors } from '~~/server/errors/chain'

export default defineCheckedEventHandler(
  { errors: [...chainErrors] },
  (event, { fail }) => {
    const mode = String(getQuery(event).mode ?? 'ok')

    if (mode !== 'ok') return fail('c-gone', { resource: mode })

    // The caller's request identity, read off this handler's own event.
    return { ok: true, cookie: getCookie(event, 'probe') ?? 'none' }
  }
)
