import { defineBetterEventHandler } from '../../../../lib/handler'
import { schema } from '../../../../lib/schema'

// Method-less (default) handler: route params + object body.
export default defineBetterEventHandler(
  {
    input: { route: schema<{ id: string }>(), body: schema<{ qty: number }>() },
  },
  (_event, { route, body }) => ({ item: route.id, qty: body.qty })
)
