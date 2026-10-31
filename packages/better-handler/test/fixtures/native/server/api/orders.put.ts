import { defineBetterEventHandler } from '@dphonys/better-handler/server'
import { schema } from '../schema'

// A tuple-composed body: what a client sends satisfies both elements.
export default defineBetterEventHandler(
  {
    input: {
      body: [
        schema<{ sku: string }>(),
        schema<{ qty: number; note?: string }>(),
      ],
    },
  },
  (_event, { body }) => ({ sku: body.sku, qty: body.qty })
)
