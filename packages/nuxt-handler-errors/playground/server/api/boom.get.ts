/** A hand-rolled failure sharing a declared status, with `data` of its own. */
export default defineEventHandler(() => {
  throw createError({
    statusCode: 403,
    statusMessage: 'nope',
    data: { reason: 'hand-rolled' },
  })
})
