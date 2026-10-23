import { defineBetterEventHandler } from '../../../../lib/handler'
import { schema } from '../../../../lib/schema'

/** A method-less handler declaring `body`: every verb; body omitted for get/head. */
export default defineBetterEventHandler(
  {
    input: { route: schema<{ id: string }>(), body: schema<{ qty: number }>() },
  },
  (_event, { route, body }) => ({ item: route.id, qty: body.qty })
)
