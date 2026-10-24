import { defineBetterEventHandler } from '../../../../../src/runtime/server'
import { orderNotFound } from '../errors/orders'

/** A foreign tagged error whose `id` the declared schema rejects. */
class OrderMissing extends Error {
  readonly _tag = 'order-not-found'

  constructor(readonly id: string) {
    super('the order is gone')
  }
}

/** Thrown fields the declared schema rejects: `id` is a string. */
export default defineBetterEventHandler({ errors: orderNotFound }, () => {
  throw new OrderMissing('seven')
})
