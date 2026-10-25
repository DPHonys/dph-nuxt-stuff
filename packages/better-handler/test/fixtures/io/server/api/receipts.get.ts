import { setResponseStatus } from 'h3'
import { defineBetterEventHandler } from '../../../../../src/runtime/server'
import { receipt } from '../io/schemas'

/**
 * The bare form: one `200` reply, returned plainly. The Handler sets another
 * status first, which the bare form overrides.
 */
export default defineBetterEventHandler({ output: receipt }, (event) => {
  setResponseStatus(event, 202)

  return { id: 'r-1', total: 3 }
})
