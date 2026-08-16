import { pagination } from '~~/server/validation/schemas'

/**
 * A bad query, the smallest failure this package answers - and no import: the
 * module registers `defineValidatedEventHandler` as a server auto-import.
 */
export default defineValidatedEventHandler(
  { validate: { query: pagination } },
  (_event, { query }) => ({ page: query.page })
)
