import { z } from 'zod'

/**
 * A **developer mistake**, on purpose: two schemas compose `query` and one of
 * them produces a string, which there is no honest way to merge into the
 * other's object. The package answers `500` at merge time and marks nothing, so
 * an observability hook that skips validation failures still reports this one -
 * which is the half of the predicate's promise that keeps bugs reporting.
 *
 * The compile-time rule cannot see it: this schema's *declared* output is an
 * object, and only the parse reveals a string. That is exactly the blind spot
 * the runtime backstop exists for - a plain-JS caller, an `any`-typed schema, a
 * transform nobody read - and writing it this way is how a real build can prove
 * the backstop without the declaration guard refusing the route first.
 */
const claimsAnObject = z
  .unknown()
  .transform(() => 'not an object at all' as unknown as { tag: string })

export default defineValidatedEventHandler(
  { validate: { query: [z.object({ q: z.string() }), claimsAnObject] } },
  () => ({ unreachable: true })
)
