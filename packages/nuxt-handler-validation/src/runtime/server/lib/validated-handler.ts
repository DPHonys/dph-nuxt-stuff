import type { H3Event } from 'h3'
import { defineEventHandler } from 'h3'
import type { DefineValidatedEventHandler } from '../../types/handler'
import type { ValidateSchemas } from '../../types/schemas'
import { raiseValidationError } from './issues'
import { SOURCE_WALK } from './sources'

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
 * The sources validate **in a guaranteed order**, and that order is a promise:
 * `routerParams -> query -> headers -> body`. Validation is **fail-fast across
 * sources** - the first source whose schema rejects answers `400` with the
 * package's one fixed shape and no later source is even read, so a bad route
 * param never costs a body parse. Issues *within* one source still arrive
 * together, which is why every issue in one answer names the same source. There
 * is no aggregate mode.
 *
 * Each source is handed to its schema exactly as h3 yields it - decoded route
 * params, `string | string[]` query values, lowercase header keys - so every
 * coercion belongs in the schema.
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

    // Fail-fast is what the `raise` inside this loop *is*: it leaves the walk
    // before any later source is read.
    for (const [source, read] of SOURCE_WALK) {
      const schema = options[source]

      // An undeclared source is not read at all: reading it would be work the
      // handler never asked for, and `undefined` in the second parameter is
      // exactly what the types say is absent.
      if (schema === undefined) continue

      const result = await schema['~standard'].validate(await read(event))

      // Discriminated on `issues`, never on `'value' in result`: a successful
      // result whose output is `undefined` may carry no `value` key at all.
      if (result.issues !== undefined) {
        raiseValidationError(source, result.issues)
      }

      validated[source] = result.value
    }

    return handler(event, validated)
  })) as DefineValidatedEventHandler
