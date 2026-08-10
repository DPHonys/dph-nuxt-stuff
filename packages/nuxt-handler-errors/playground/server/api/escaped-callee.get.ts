/**
 * A callee's known failure, let escape - the throwing global, used exactly as
 * vanilla `$fetch` is. The framework marks the escape `unhandled` and the
 * production serializer scrubs `data`, so the variant cannot reach this
 * route's client, while the callee's status line leaks as this route's own
 * answer. Server-to-server is `.try` plus translation arms for that reason.
 */
export default defineEventHandler(async (): Promise<{ reached: true }> => {
  await $checkedFetch('/api/users/missing')

  return { reached: true }
})
