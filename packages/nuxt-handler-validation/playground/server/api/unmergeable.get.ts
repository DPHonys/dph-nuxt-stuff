import { z } from 'zod'

/**
 * Declares an object output; only the parse reveals a string. `z.custom` is
 * how a library lets an author claim an output it does not check.
 */
const claimsAnObject = z.preprocess(
  () => 'not an object at all',
  z.custom<{ tag: string }>(() => true)
)

/** A deliberate mistake: the package answers `500`, and marks nothing. */
export default defineValidatedEventHandler(
  { input: { query: [z.object({ q: z.string() }), claimsAnObject] } },
  () => ({ unreachable: true })
)
