import { defineErrors, payload } from '@dphonys/nuxt-handler-errors-old/server'

/**
 * A catalogue authored in the consumer's `server/` directory — the documented
 * default location — and imported across a real package boundary through the
 * published `/server` specifier. Server-side is the only side it can be
 * authored on, and the only side that has any use for it: a route's declared
 * union reaches the client through the generated map, never through this file.
 *
 * The two variants differ in status *and* in payload on purpose: that is what
 * makes the literal-preservation claim mean something.
 */
export const userErrors = defineErrors({
  'user-not-found': { status: 404, payload: payload<{ userId: string }>() },
  'user-suspended': { status: 403, payload: payload<{ until: string }>() },
})
