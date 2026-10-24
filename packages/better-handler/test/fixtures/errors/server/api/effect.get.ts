import { Schema } from 'effect'
import { defineBetterEventHandler } from '../../../../../src/runtime/server'

/** An Effect error class, declared through its own Standard Schema. */
// eslint-disable-next-line unicorn/throw-new-error -- Effect's error class builder, extended rather than thrown
class OrderMissing extends Schema.TaggedError<OrderMissing>()('OrderMissing', {
  id: Schema.Number,
}) {}

export default defineBetterEventHandler(
  {
    errors: {
      OrderMissing: {
        status: 404,
        schema: Schema.toStandardSchemaV1(OrderMissing),
      },
    },
  },
  () => {
    // Thrown as-is: no Fail helper, no conversion.
    throw new OrderMissing({ id: 7 })
  }
)
