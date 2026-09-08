import { pagination, sorting } from '../validation/schemas'

/**
 * An `input`-only route with a composed (tuple) query: the parent's
 * context, the umbrella's failure wire.
 */
export default defineTypedEventHandler(
  { input: { query: [pagination, sorting] } },
  (_event, { query }) => {
    const hits: string[] = []

    return { page: query.page, hits }
  }
)
