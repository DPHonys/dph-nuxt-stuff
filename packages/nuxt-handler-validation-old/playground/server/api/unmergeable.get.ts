import { z } from 'zod'

/**
 * A **developer mistake**, on purpose: two unnamed fragments declare `query`
 * and one of them outputs a string, which there is no honest way to merge into
 * the other's object. The package answers `500` at merge time and marks
 * nothing, so an observability hook that skips validation failures still
 * reports this one - which is the half of the predicate's promise that keeps
 * bugs reporting.
 *
 * The compiler poisons this declaration too, as the type-level half of the same
 * rule: `query` here is a `CompositionError`, so **reading** it would not
 * compile. This handler deliberately does not, which is what lets the route
 * exist to prove the runtime backstop for the declarations types cannot see -
 * plain JS, a widened array, an `any`-typed schema.
 */
export default defineValidatedEventHandler(
  [
    { query: z.object({ q: z.string() }) },
    { query: z.unknown().transform(() => 'not an object') },
  ],
  () => ({ unreachable: true })
)
