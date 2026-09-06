import { defineCheckedEventHandler } from '@dphonys/nuxt-handler-errors/server'
import { userErrors } from '../../errors/users'

export default defineCheckedEventHandler(
  {
    errors: [...userErrors],
  },
  (event, { errors }) => {
    const id = event.context.params?.id ?? ''

    if (id === 'missing') throw errors.userNotFound({ userId: id })
    if (id === 'suspended') throw errors.userSuspended({ until: '2026-12-31' })
    if (id === 'private') throw errors.forbidden({ requiredRole: 'owner' })
    if (id === 'limited') throw errors.rateLimited({ retryAfter: 30 })

    return { id, name: `User ${id}`, email: `${id}@example.com` }
  }
)
