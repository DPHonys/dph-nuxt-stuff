import { pagination } from '../validation/schemas'

/** A `validate`-only route: the parent's context, the umbrella's failure wire. */
export default defineTypedEventHandler(
  { validate: { query: pagination } },
  (_event, { query }) => ({ page: query.page, hits: [] as string[] })
)
