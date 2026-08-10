import { defineError, payload } from '@dphonys/nuxt-handler-errors/server'
import { z } from 'zod'

export const userErrors = defineError({
  'user-not-found': { status: 404, payload: payload<{ userId: string }>() },
  'user-suspended': { status: 403, payload: payload<{ until: string }>() },
})

export const forbidden = defineError('forbidden', {
  status: 403,
  payload: payload<{ requiredRole: 'admin' | 'owner' }>(),
})

/** The other door into the payload position: a schema, never executed. */
export const rateLimited = defineError('rate-limited', {
  status: 429,
  payload: z.object({ retryAfter: z.number() }),
})
