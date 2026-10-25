import { defineBetterEventHandler } from '@dphonys/better-handler/server'
import { schema } from '../../schema'

// Route params only.
export default defineBetterEventHandler(
  { input: { route: schema<{ slug: string }>() } },
  (_event, { route }) => ({ slug: route.slug })
)
