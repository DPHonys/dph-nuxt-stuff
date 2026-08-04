import { defineErrors, payload } from '@dphonys/nuxt-handler-errors/shared'

/**
 * A catalogue authored in the consumer's `shared/` directory — SPEC.md §3.2's
 * documented default location — and imported across a real package boundary
 * through the published `/shared` specifier.
 *
 * The two variants differ in status *and* in payload on purpose: that is what
 * makes the literal-preservation claim mean something.
 */
export const userErrors = defineErrors({
  'user-not-found': { status: 404, payload: payload<{ userId: string }>() },
  'user-suspended': { status: 403, payload: payload<{ until: string }>() },
})
