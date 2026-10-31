import { defineBetterEventHandler } from '../../../../../src/runtime/server'

/**
 * A status map declaring its `200` bodiless: stored, with nothing to send
 * back. h3 alone would answer the `null` with a `204`.
 */
export default defineBetterEventHandler(
  { output: { 200: null } },
  (_event, { respond }) => respond(200)
)
