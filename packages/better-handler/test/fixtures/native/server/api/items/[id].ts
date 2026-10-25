import { defineBetterEventHandler } from '@dphonys/better-handler/server'
import { schema } from '../../schema'

// No method in the file name: one handler for every method.
export default defineBetterEventHandler(
  {
    input: { route: schema<{ id: string }>(), body: schema<{ qty: number }>() },
  },
  (_event, { route, body }) => ({ item: route.id, qty: body.qty })
)
