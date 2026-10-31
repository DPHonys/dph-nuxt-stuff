import { setResponseStatus } from 'h3'
import { defineBetterEventHandler } from '../../../../../src/runtime/server'
import { receipt } from '../io/schemas'

/**
 * The bare form: one `200` reply, returned plainly. The Handler sets another
 * status and its message first, both of which the bare form overrides.
 */
export default defineBetterEventHandler({ output: receipt }, (event) => {
  setResponseStatus(event, 404, 'Not Found')

  return { id: 'r-1', total: 3 }
})
