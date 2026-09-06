import { defineCheckedEventHandler } from '@dphonys/nuxt-handler-errors/server'
import { userErrors } from '../../errors/users'

export default defineCheckedEventHandler(
  {
    errors: [...userErrors],
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
