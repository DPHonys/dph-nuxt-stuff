import { Schema } from 'effect'

/** An Effect error class: its own Standard Schema is the declaration. */
// eslint-disable-next-line unicorn/throw-new-error -- Effect's error class builder, extended rather than thrown
class OrderMissing extends Schema.TaggedError<OrderMissing>()('OrderMissing', {
  id: Schema.Number,
}) {}

/** `/api/effect` - the instance thrown as-is goes out as declared. */
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
    throw new OrderMissing({ id: 7 })
  }
)
