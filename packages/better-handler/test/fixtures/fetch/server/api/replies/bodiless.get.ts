import { defineBetterEventHandler } from '../../../../../../src/runtime/server'

/** A `200` declared `null`: no body at all, under the declared status. */
export default defineBetterEventHandler(
  { output: { 200: null } },
  (_event, { respond }) => respond(200)
)
