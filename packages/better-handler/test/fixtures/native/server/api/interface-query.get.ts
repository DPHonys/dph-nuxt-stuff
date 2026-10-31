import { defineBetterEventHandler } from '@dphonys/better-handler/server'
import { schema } from '../schema'

/** An interface has no implicit index signature, which h3's query needs. */
interface Filters {
  status: 'open' | 'closed'
}

export default defineBetterEventHandler(
  { input: { query: schema<Filters>() } },
  (_event, { query }) => ({ status: query.status })
)
