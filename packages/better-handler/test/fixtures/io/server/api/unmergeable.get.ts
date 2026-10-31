import { z } from 'zod'
import { defineBetterEventHandler } from '../../../../../src/runtime/server'

/**
 * Claims an object output the parse never produces: `z.custom` is how a
 * library lets an author claim an output it does not check. A developer's
 * mistake, so a plain `500`, never a Known error.
 */
const claimsAnObject = z.preprocess(
  () => 'not an object at all',
  z.custom<{ tag: string }>(() => true)
)

export default defineBetterEventHandler(
  { input: { query: [z.object({ q: z.string() }), claimsAnObject] } },
  () => ({ unreachable: true })
)
