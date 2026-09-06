import { defineError } from '@dphonys/nuxt-handler-errors/server'
import { z } from 'zod'

export const userErrors = defineError({
  userNotFound: { status: 404, payload: z.object({ userId: z.string() }) },
  userSuspended: { status: 403, payload: z.object({ until: z.string() }) },
  forbidden: {
    status: 403,
    payload: z.object({ requiredRole: z.enum(['admin', 'owner']) }),
  },
  rateLimited: {
    status: 429,
    payload: z.object({ retryAfter: z.number() }),
  },
})
