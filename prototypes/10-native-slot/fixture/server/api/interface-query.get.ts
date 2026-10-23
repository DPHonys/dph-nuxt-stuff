import { defineBetterEventHandler } from '../../../lib/handler'
import { schema } from '../../../lib/schema'

// An interface-typed query input has no implicit index signature, so it is not
// assignable to h3's `QueryObject`. Constraints are not re-checked on
// instantiation: does the slot still reach Nuxt?
interface Filters {
  status: 'open' | 'closed'
}

export default defineBetterEventHandler(
  { input: { query: schema<Filters>() } },
  (_event, { query }) => ({ status: query.status })
)
