import type { H3Event } from 'h3'
import { defineEventHandler } from 'h3'
import { VALIDATION_NAME } from '../../shared/name'
import type {
  ValidationFragment,
  ValidationGroup,
} from '../../types/composition'
import type {
  DefineValidation,
  DefineValidatedEventHandler,
} from '../../types/handler'
import type { ValidateSchemas } from '../../types/schemas'
import { declarationPlan } from './declaration'
import { validatedValueFor } from './fragments'

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
 * Give the set a **name** and its outputs nest under that name, in every source
 * it declares:
 *
 * ```ts
 * export const pagination = defineValidation('pagination', {
 *   query: z.object({ page: z.coerce.number() }),
 * })
 *
 * // → query.pagination.page
 * ```
 *
 * The nesting is uniform - alone or composed, collision or not - so adding a
 * set to a route never reshapes the values already there, and
 * `query.pagination` is *exactly* that set's schema output, passable whole to a
 * helper typed off the same schema. Namespacing touches outputs only: every
 * schema still parses the whole raw source, so the name never reaches the wire
 * and never appears in a failing issue's `path`.
 *
 * Inline literals are fine as fragments; anything exported and reused is worth
 * defining here, because this is where a misspelled source key reports - once,
 * in the file that is wrong, rather than at every consuming route.
 */
// Annotated AND cast, the sibling's `defineError` idiom: an arity-overloaded
// signature has no single implementation shape to check a body against.
export const defineValidation: DefineValidation = ((
  nameOrSchemas: string | ValidateSchemas,
  namedSchemas?: ValidateSchemas
): ValidationGroup<ValidationFragment> =>
  typeof nameOrSchemas === 'string'
    ? [{ ...namedSchemas, [VALIDATION_NAME]: nameOrSchemas }]
    : [nameOrSchemas]) as DefineValidation

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
  // Resolved once, when the route file is evaluated: which form the caller
  // wrote, which sources it declared and what validates each of them are not
  // per-request questions, and a route serving thousands of requests should
  // answer them none of those times. A malformed declaration throws here -
  // at startup, before any request is served.
  const plan = declarationPlan(options)

  return defineEventHandler(async (event) => {
    const validated: Record<string, unknown> = {}

    // Fail-fast is what the `raise` inside this loop *is*: it leaves the walk
    // before any later source is read. An undeclared source is absent from the
    // plan, so it is never read - and a declared one is read **once**, outside
    // the fragments, however many of them declare it.
    for (const { source, read, declarations } of plan) {
      validated[source] = await validatedValueFor(
        source,
        declarations,
        await read(event)
      )
    }

    return handler(event, validated)
  })
}) as DefineValidatedEventHandler
