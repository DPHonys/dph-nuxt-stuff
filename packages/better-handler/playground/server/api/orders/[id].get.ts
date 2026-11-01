import { z } from 'zod'
import { commonErrors } from '../../errors/common'

/**
 * A schema-bearing error, a schema-less one, and a shared declaration spread
 * in, each raised through the Fail helper:
 *
 * - `/api/orders/404` - `order-not-found`, with its `id`;
 * - `/api/orders/locked` - `order-locked`, its tag alone;
 * - `/api/orders/private` - the shared `forbidden`, with its role;
 * - `/api/orders/7` - the order.
 */
export default defineBetterEventHandler(
  {
    errors: {
      'order-not-found': { status: 404, schema: z.object({ id: z.number() }) },
      'order-locked': { status: 409 },
      ...commonErrors,
    },
  },
  (event, { fail }) => {
    const ref = getRouterParam(event, 'id')

    if (ref === 'locked') throw fail('order-locked')
    if (ref === 'private') throw fail('forbidden', { requiredRole: 'owner' })

    const id = Number(ref)

    if (id > 100) throw fail('order-not-found', { id })

    return { id, total: 42 }
  }
)
