import { getRouterParam } from 'h3'
import { defineBetterEventHandler } from '../../../../../../src/runtime/server'
import { orderNotFound } from '../../errors/orders'

// Imported by relative path rather than auto-imported, so the package's own
// typecheck reads this file as an app's would without a generated `.nuxt`.
export default defineBetterEventHandler(
  {
    errors: { ...orderNotFound, 'order-locked': { status: 409 } },
  },
  (event, { fail }) => {
    const ref = getRouterParam(event, 'id')

    if (ref === 'locked') throw fail('order-locked')

    const id = Number(ref)

    if (id > 100) throw fail('order-not-found', { id })

    return { id, total: 42 }
  }
)
