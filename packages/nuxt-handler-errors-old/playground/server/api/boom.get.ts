/**
 * A hand-rolled framework error sharing a status with a declared variant —
 * `user-suspended` is also 403 — and carrying `data` of its own.
 *
 * This route is what makes the wire-format claim testable rather than asserted:
 * the discriminator is **marker presence**, not status, and this response must
 * come back with no marker and its own `data` untouched.
 */
export default defineEventHandler(() => {
  throw createError({
    statusCode: 403,
    statusMessage: 'nope',
    data: { reason: 'hand-rolled' },
  })
})
