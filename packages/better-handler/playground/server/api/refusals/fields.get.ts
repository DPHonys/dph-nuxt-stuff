import { z } from 'zod'

/** A tagged error of the app's own, whose `id` is not the declared number. */
class OrderMissing extends Error {
  readonly _tag = 'order-not-found'

  constructor(readonly id: string) {
    super('the order is gone')
  }
}

/**
 * `/api/refusals/fields` - fields the declared schema rejects. A dev server
 * refuses them with a plain `500` naming the route, the tag and the issue; a
 * production build sends them as thrown.
 */
export default defineBetterEventHandler(
  {
    errors: {
      'order-not-found': { status: 404, schema: z.object({ id: z.number() }) },
    },
  },
  () => {
    throw new OrderMissing('seven')
  }
)
