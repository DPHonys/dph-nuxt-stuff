import { defineError } from '@dphonys/nuxt-typed-handler/server'
import { z } from 'zod'

export const userErrors = defineError({
  'user-not-found': { status: 404, payload: z.object({ userId: z.string() }) },
  'user-exists': {
    status: 409,
    payload: z.object({ email: z.string().trim().toLowerCase() }),
  },
})
