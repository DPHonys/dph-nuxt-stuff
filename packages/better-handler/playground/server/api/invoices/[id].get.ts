import { z } from 'zod'
import { invoiceRef } from '~~/server/io/schemas'

/**
 * The route source beside declared errors, so the route can fail with
 * either kind of Known error:
 *
 * - `/api/invoices/7` - the invoice;
 * - `/api/invoices/seven` - `validation-failed`, naming the `route` source;
 * - `/api/invoices/404` - `invoice-not-found`, with its `id`.
 */
export default defineBetterEventHandler(
  {
    input: { route: invoiceRef },
    errors: {
      ...defineError('invoice-not-found', {
        status: 404,
        // The Handler's converted number, not the route's string: the
        // error carries what `fail` is handed, so `invoiceRef`'s string
        // input would refuse it.
        schema: z.object({ id: z.number() }),
      }),
    },
  },
  (_event, { route, fail }) => {
    if (route.id > 100) throw fail('invoice-not-found', { id: route.id })

    return { id: route.id, total: 42 }
  }
)
