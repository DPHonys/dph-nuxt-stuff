import { defineBetterEventHandler } from '../../../../../src/runtime/server'
import { orderNotFound } from '../errors/orders'

class OrderPaid extends Error {
  readonly _tag = 'order-paid'
}

/** A tagged throw whose tag this route never declared. */
export default defineBetterEventHandler({ errors: orderNotFound }, () => {
  throw new OrderPaid('paid already')
})
