/**
 * `GET /api/relay` - the fetch family inside the server: `event.$betterFetch`
 * calls `/api/orders/7` with this request's cookies and headers, and `.try`
 * reads `/api/orders/404`'s Known error as its tagged object.
 */
export default defineEventHandler(async (event) => {
  const order = await event.$betterFetch('/api/orders/7')
  const missing = await event.$betterFetch.try('/api/orders/404')

  return {
    total: order.total,
    missing:
      missing.error?._tag === 'order-not-found' ? missing.error.id : null,
  }
})
