import { pagination, sorting } from '../validation/schemas'

/**
 * A `validate`-only route with a composed (tuple) query: the parent's
 * context, the umbrella's failure wire.
 */
export default defineTypedEventHandler(
  { validate: { query: [pagination, sorting] } },
  (_event, { query }) => ({ page: query.page, hits: [] as string[] })
)
