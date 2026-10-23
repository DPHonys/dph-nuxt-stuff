import { defineBetterEventHandler } from '../../../../lib/handler'
import { schema } from '../../../../lib/schema'

// Route params only.
export default defineBetterEventHandler(
  { input: { route: schema<{ slug: string }>() } },
  (_event, { route }) => ({ slug: route.slug })
)
