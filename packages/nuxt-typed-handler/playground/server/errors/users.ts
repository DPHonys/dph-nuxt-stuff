import { defineError } from '@dphonys/nuxt-typed-handler/server'
import { z } from 'zod'

export const userErrors = defineError({
  userNotFound: { status: 404, payload: z.object({ userId: z.string() }) },
  userExists: {
    status: 409,
    payload: z.object({ email: z.string().trim().toLowerCase() }),
  },
})
