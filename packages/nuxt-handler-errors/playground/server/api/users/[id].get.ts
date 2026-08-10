import { defineCheckedEventHandler } from '@dphonys/nuxt-handler-errors/server'
import { forbidden, rateLimited, userErrors } from '~~/server/errors/users'

export default defineCheckedEventHandler(
  { errors: [...userErrors, forbidden, rateLimited] },
  (event, { fail }) => {
    const id = event.context.params?.id ?? ''

    if (id === 'missing') return fail('user-not-found', { userId: id })
    if (id === 'suspended')
      return fail('user-suspended', { until: '2026-12-31' })
    if (id === 'private') return fail('forbidden', { requiredRole: 'owner' })
    if (id === 'limited') return fail('rate-limited', { retryAfter: 30 })

    return { id, name: `User ${id}`, email: `${id}@example.com` }
  }
)
