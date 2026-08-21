import { schema } from '../lib/schema'
import { defineTypedEventHandler } from '../lib/typed-handler'

/** A `default` (method-less) handler declaring `body`: reachable by every verb; body omitted for get/head. */
export default defineTypedEventHandler(
  { validate: { routerParams: schema<{ id: string }>(), body: schema<{ qty: number }>() } },
  (_event, { routerParams, body }) => ({ item: routerParams.id, qty: body.qty })
)
