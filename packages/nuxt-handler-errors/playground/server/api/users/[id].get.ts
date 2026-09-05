import { defineCheckedEventHandler } from '@dphonys/nuxt-handler-errors/server'
import { z } from 'zod'

export default defineCheckedEventHandler(
  {
    errors: {
      'user-not-found': { status: 404, data: z.object({ userId: z.string() }) },
      'user-suspended': { status: 403, data: z.object({ until: z.string() }) },
      forbidden: {
        status: 403,
        data: z.object({ requiredRole: z.enum(['admin', 'owner']) }),
      },
      'rate-limited': {
        status: 429,
        data: z.object({ retryAfter: z.number() }),
      },
    },
  },
  (event, { errors }) => {
    const id = event.context.params?.id ?? ''

    if (id === 'missing') throw errors['user-not-found']({ userId: id })
    if (id === 'suspended')
      throw errors['user-suspended']({ until: '2026-12-31' })
    if (id === 'private') throw errors.forbidden({ requiredRole: 'owner' })
    if (id === 'limited') throw errors['rate-limited']({ retryAfter: 30 })

    return { id, name: `User ${id}`, email: `${id}@example.com` }
  }
)
