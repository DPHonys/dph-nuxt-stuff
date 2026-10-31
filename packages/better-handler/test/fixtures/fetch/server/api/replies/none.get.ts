import { z } from 'zod'
import { defineBetterEventHandler } from '../../../../../../src/runtime/server'

/** The bare form over a nullable schema, answering its `null`: JSON `null`. */
export default defineBetterEventHandler(
  { output: z.object({ id: z.number() }).nullable() },
  () => null
)
