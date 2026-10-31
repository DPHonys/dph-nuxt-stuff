import { defineBetterEventHandler } from '../../../../../../src/runtime/server'
import { orderRef } from '../../io/schemas'

// Imported by relative path rather than auto-imported, so the package's own
// typecheck reads this file as an app's would without a generated `.nuxt`.

/** The route source beside a declared error: both kinds of Known error. */
export default defineBetterEventHandler(
  {
    input: { route: orderRef },
    errors: { 'order-not-found': { status: 404 } },
  },
  (_event, { route, fail }) => {
    if (route.id > 100) throw fail('order-not-found')

    return { id: route.id }
  }
)
