import type { H3Event } from 'h3'
import { defineEventHandler, getQuery } from 'h3'
import type { DefineValidatedEventHandler } from '../../types/handler'
import type { ValidateSchemas } from '../../types/schemas'
import { raiseValidationError } from './issues'

/**
 * Declare what a handler validates, and receive the validated values - already
 * typed as each schema's output - in the handler's second parameter.
 *
 * ```ts
 * export default defineValidatedEventHandler(
 *   { query: z.object({ page: z.coerce.number() }) },
 *   async (event, { query }) => listUsers(query.page)
 * )
 * ```
 *
 * Validation runs before the handler body, and a failure answers `400` with
 * the package's one fixed shape.
 */
// Annotated AND cast - the sibling's `defineError` idiom, for a definer whose
// body cannot be checked against its declared type. Here the mismatch is the
// promise: the wrapper always hands h3 one, while the public signature reports
// the handler's own `Response`, which is what Nitro's typed routes read and
// what a call site awaits. The annotation is what makes a change to
// `DefineValidatedEventHandler` an error here rather than a silently widened
// export; the cast is what lets the erased body satisfy it.
export const defineValidatedEventHandler: DefineValidatedEventHandler = ((
  options: ValidateSchemas,
  handler: (event: H3Event, validated: Record<string, unknown>) => unknown
) =>
  defineEventHandler(async (event) => {
    const validated: Record<string, unknown> = {}

    if (options.query !== undefined) {
      // Query is passed as `getQuery` yields it - values are
      // `string | string[]`, duplicate keys become arrays. All coercion
      // belongs in the user's schema.
      const result = await options.query['~standard'].validate(getQuery(event))

      // Discriminated on `issues`, never on `'value' in result`: a successful
      // result whose output is `undefined` may carry no `value` key at all.
      if (result.issues !== undefined) {
        raiseValidationError('query', result.issues)
      }

      validated.query = result.value
    }

    return handler(event, validated)
  })) as DefineValidatedEventHandler
