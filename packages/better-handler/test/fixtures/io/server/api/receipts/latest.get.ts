import { defineBetterEventHandler } from '../../../../../../src/runtime/server'
import { receipt } from '../../io/schemas'

/**
 * The bare form over a nullable schema, whose `null` is a `200` with no body:
 * there is no latest receipt yet.
 */
export default defineBetterEventHandler(
  { output: receipt.nullable() },
  () => null
)
