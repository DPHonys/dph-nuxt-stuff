import { defineError, payload } from '@dphonys/nuxt-handler-errors/server'
import { z } from 'zod'

export const userErrors = defineError({
  'user-not-found': { status: 404, payload: z.object({ userId: z.string() }) },
  'user-suspended': { status: 403, payload: payload<{ until: string }>() },
  forbidden: {
    status: 403,
    payload: z.object({ requiredRole: z.enum(['admin', 'owner']) }),
  },
  'rate-limited': {
    status: 429,
    payload: z.object({ retryAfter: z.number() }),
  },
})
