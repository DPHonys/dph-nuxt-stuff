import { pagination } from '~~/server/io/schemas'

/**
 * `/api/search?page=2` - the query source. `?page=two` answers `400` with
 * `data: { _tag: 'validation-failed', issues }`, the route's whole union.
 */
export default defineBetterEventHandler(
  { input: { query: pagination } },
  (_event, { query }) => ({ page: query.page })
)
