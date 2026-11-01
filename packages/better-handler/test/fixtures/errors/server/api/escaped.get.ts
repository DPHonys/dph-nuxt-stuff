import { defineEventHandler } from 'h3'

/**
 * A callee's Known error, let escape: the vanilla `$fetch` rejects with the
 * callee's whole error body as its `data`, and this route rethrows it as is.
 */
export default defineEventHandler(async () => {
  await $fetch('/api/orders/404')

  return { reached: true }
})
