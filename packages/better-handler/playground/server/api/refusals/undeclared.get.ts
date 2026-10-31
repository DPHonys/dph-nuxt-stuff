class OrderPaid extends Error {
  readonly _tag = 'order-paid'
}

/**
 * `/api/refusals/undeclared` - a tag this route never declared. A dev server
 * refuses it with a plain `500` naming the tag and the declared ones; a
 * production build lets it propagate untouched.
 */
export default defineBetterEventHandler(
  { errors: { 'order-locked': { status: 409 } } },
  () => {
    throw new OrderPaid('paid already')
  }
)
