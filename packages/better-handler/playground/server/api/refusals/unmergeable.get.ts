import { z } from 'zod'

/**
 * Claims an object output the parse never produces: `z.custom` is how a
 * library lets an author claim an output it does not check, so the compile
 * guard cannot see it.
 */
const claimsAnObject = z.preprocess(
  () => 'not an object at all',
  z.custom<{ tag: string }>(() => true)
)

/**
 * `/api/refusals/unmergeable?q=x` - a composed tuple whose outputs cannot
 * merge. A developer's mistake, so a plain `500` naming the route, the source
 * and the element, never a Known error.
 */
export default defineBetterEventHandler(
  { input: { query: [z.object({ q: z.string() }), claimsAnObject] } },
  () => ({ unreachable: true })
)
