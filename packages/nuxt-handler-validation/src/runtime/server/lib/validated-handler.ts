import type { H3Event } from 'h3'
import { defineEventHandler } from 'h3'
import type { ValidationFragment } from '../../types/composition'
import type {
  DefineValidation,
  DefineValidatedEventHandler,
} from '../../types/handler'
import type { ValidateSchemas } from '../../types/schemas'
import { declarationsFor, fragmentsOf, validatedValueFor } from './fragments'
import { SOURCE_WALK } from './sources'

/**
 * Declare a reusable set of schemas once, and spread it into every route that
 * needs it.
 *
 * ```ts
 * export const pagination = defineValidation({
 *   query: z.object({ page: z.coerce.number() }),
 * })
 *
 * export default defineValidatedEventHandler(
 *   [...pagination, { body: profileBody }],
 *   async (event, { query, body }) => listUsers(query.page, body)
 * )
 * ```
 *
 * The returned group is a one-element tuple, and **groups compose by array
 * spread**: `[...pagination, ...sorting]`. Spread appends, so two sets that
 * declare the same source both run - which is the whole reason sets are values
 * and not objects to merge. A single group needs no spread at all:
 * `defineValidatedEventHandler(pagination, ...)`.
 *
 * Inline literals are fine as fragments; anything exported and reused is worth
 * defining here, because this is where a misspelled source key reports - once,
 * in the file that is wrong, rather than at every consuming route.
 */
export const defineValidation: DefineValidation = (schemas) => [schemas]

/**
 * Declare what a handler validates, and receive the validated values - already
 * typed as each schema's output - in the handler's second parameter.
 *
 * ```ts
 * export default defineValidatedEventHandler(
 *   {
 *     routerParams: z.object({ id: z.coerce.number() }),
 *     body: z.object({ name: z.string() }),
 *   },
 *   async (event, { routerParams, body }) => updateUser(routerParams.id, body)
 * )
 * ```
 *
 * All four sources - `routerParams`, `query`, `headers`, `body` - may be
 * declared in one object and are validated before the handler body runs.
 *
 * Reusable sets composed with `defineValidation` are declared the same way, as
 * an array of fragments:
 *
 * ```ts
 * export default defineValidatedEventHandler(
 *   [...pagination, ...sorting, { body: profileBody }],
 *   async (event, { query, body }) => listUsers(query, body)
 * )
 * ```
 *
 * When several fragments declare **one** source, all of them run, in array
 * order, against the same raw source value - composing sets composes their
 * validations. Their outputs then shallow-merge in that order, so a key two of
 * them produce is later-wins. A source declared by more than one fragment
 * therefore needs every one of their outputs to be a plain object; a lone
 * output is delivered as it is, primitive or not.
 *
 * The sources validate **in a guaranteed order**, and that order is a promise:
 * `routerParams -> query -> headers -> body`. Validation is **fail-fast across
 * sources** - the first source that fails answers `400` with the package's one
 * fixed shape and no later source is even read, so a bad route param never
 * costs a body parse. Issues *within* one source still arrive together - across
 * that source's fragments as well as within one schema - which is why every
 * issue in one answer names the same source. There is no aggregate mode.
 *
 * A body the request itself made unreadable fails the same way: a body read
 * that throws a `4xx` becomes exactly one `body` issue in that same shape, so
 * an unparseable payload is not a special case a client must detect
 * differently. A method that cannot carry a body validates `undefined`.
 *
 * Each source is handed to its schema exactly as h3 yields it - decoded route
 * params, `string | string[]` query values, lowercase header keys, h3's own
 * body parse - so every coercion belongs in the schema. The validated values
 * arrive in the second parameter, and that is the door to them: reading the
 * body again with `readBody` yields h3's memoized *unvalidated* parse.
 */
// Annotated AND cast - the sibling's `defineError` idiom, for a definer whose
// body cannot be checked against its declared type. Here the mismatch is the
// promise: the wrapper always hands h3 one, while the public signature reports
// the handler's own `Response`, which is what Nitro's typed routes read and
// what a call site awaits. The annotation is what makes a change to
// `DefineValidatedEventHandler` an error here rather than a silently widened
// export; the cast is what lets the erased body satisfy it.
export const defineValidatedEventHandler: DefineValidatedEventHandler = ((
  options: ValidateSchemas | readonly ValidationFragment[],
  handler: (event: H3Event, validated: Record<string, unknown>) => unknown
) => {
  // Resolved once, at declaration: the form the caller wrote is not a
  // per-request question, and a route serving thousands of requests should
  // answer it none of those times.
  const fragments = fragmentsOf(options)

  return defineEventHandler(async (event) => {
    const validated: Record<string, unknown> = {}

    // Fail-fast is what the `raise` inside this loop *is*: it leaves the walk
    // before any later source is read.
    for (const [source, read] of SOURCE_WALK) {
      const declarations = declarationsFor(fragments, source)

      // An undeclared source is not read at all: reading it would be work the
      // handler never asked for, and `undefined` in the second parameter is
      // exactly what the types say is absent. The read stays here, outside the
      // fragments, because a source is read **once** per request however many
      // fragments declare it.
      if (declarations.length === 0) continue

      validated[source] = await validatedValueFor(
        source,
        declarations,
        await read(event)
      )
    }

    return handler(event, validated)
  })
}) as DefineValidatedEventHandler
