import { defineBetterEventHandler } from '../../../lib/handler'
import { schema } from '../../../lib/schema'

// Tuple-composed body: the wire must satisfy both elements.
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
