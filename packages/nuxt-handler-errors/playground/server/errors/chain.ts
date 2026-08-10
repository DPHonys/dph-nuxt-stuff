import { defineError, payload } from '@dphonys/nuxt-handler-errors/server'

export const chainErrors = defineError({
  'c-gone': { status: 404, payload: payload<{ resource: string }>() },
})
