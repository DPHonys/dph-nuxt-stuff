import { defineErrors, payload } from '@dphonys/nuxt-handler-errors-old/server'

/**
 * A second catalogue, so a route can compose two and narrow one with `.pick()`
 * — the honesty argument for `.pick()`: a route that lists variants it can
 * never produce has published a contract for failures that will never arrive.
 */
export const authErrors = defineErrors({
  unauthorized: { status: 401 },
  forbidden: {
    status: 403,
    payload: payload<{ requiredRole: 'admin' | 'owner' }>(),
  },
  'token-expired': { status: 401, payload: payload<{ expiredAt: string }>() },
})
