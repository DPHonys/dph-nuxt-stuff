import { defineBetterEventHandler } from '../../../../../src/runtime/server'
import { receipt } from '../io/schemas'

/**
 * A response its declared output rejects, as a value the types never saw
 * hands it over: a dev server refuses it, a production build sends it.
 */
export default defineBetterEventHandler({ output: receipt }, () =>
  JSON.parse('{"id":1,"total":"free"}')
)
