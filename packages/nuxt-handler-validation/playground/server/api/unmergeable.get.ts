import { z } from 'zod'

/** Declares an object output; only the parse reveals a string. */
const claimsAnObject = z
  .unknown()
  .transform(() => 'not an object at all' as unknown as { tag: string })

/** A deliberate mistake: the package answers `500`, and marks nothing. */
export default defineValidatedEventHandler(
  { validate: { query: [z.object({ q: z.string() }), claimsAnObject] } },
  () => ({ unreachable: true })
)
