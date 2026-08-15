/**
 * The `@dphonys/nuxt-handler-validation/server` entry - the whole runtime
 * surface. Both names are auto-imported inside `server/`, the same ambient
 * position as `defineEventHandler`, and this entry is the explicit door for
 * everywhere auto-imports do not reach (Nitro plugins and tasks, tests,
 * non-Nuxt Nitro consumers).
 *
 * Two exports. v1 had three; `defineValidation` is gone, because the unit of
 * reuse is now the schema value itself - see DESIGN.md.
 */
import type {
  EventHandler,
  EventHandlerRequest,
  EventHandlerResponse,
  H3Event,
} from 'h3'
import { defineEventHandler } from 'h3'
import type {
  ValidatedContext,
  ValidationErrorData,
  ValidationSchemas,
} from '../types'
import type { ValidationSchemasGuard } from '../types/internal'
import { sourcePlan, validatedContext } from './lib/validate'

/**
 * The wrapper. One signature - no overloads, so every rejected declaration
 * reports at the offending key instead of collapsing into a
 * "no overload matches this call" paragraph.
 *
 * - The options argument nests the schemas under `validate` - the sibling's
 *   `{ errors: [...] }` shape, and h3 v2's own key for exactly this concern,
 *   so a future h3 alignment (or a combined wrapper with the sibling) has a
 *   named slot to meet.
 * - `const S` keeps each schema's exact type - and each composed tuple's
 *   tuple-ness - reaching the handler.
 * - Validated values arrive eagerly, fully typed, in the second parameter;
 *   undeclared sources are absent from it, not `unknown`.
 * - The return type is a plain h3 `EventHandler`, so the response type flows
 *   to Nitro's typed routes exactly as `defineEventHandler`'s does. No
 *   phantom property until something consumes one.
 *
 * The sources validate **in a guaranteed order**, and that order is a promise:
 * `routerParams -> query -> headers -> body`. Validation is **fail-fast across
 * sources** - the first source that fails answers `400` with the package's one
 * fixed shape and no later source is even read, so a bad route param never
 * costs a body parse. Issues *within* one source arrive together, so a form
 * with two bad fields needs one round trip. There is no aggregate mode.
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
// `Response` has no default type parameter on purpose (the sibling's rule):
// an explicit type argument becomes an arity error instead of silently
// collapsing the success type to `any`.
export function defineValidatedEventHandler<
  const S extends ValidationSchemas,
  Response extends EventHandlerResponse,
  Request extends EventHandlerRequest = EventHandlerRequest,
>(
  options: { validate: S & ValidationSchemasGuard<S> },
  handler: (event: H3Event<Request>, validated: ValidatedContext<S>) => Response
): EventHandler<Request, Response> {
  // Resolved once, when the route file is evaluated: which sources this route
  // declares and what validates each of them are not per-request questions.
  const plan = sourcePlan(options.validate)

  // Cast, and only here: the wrapper always hands h3 one promise, while the
  // public signature reports the handler's own `Response` - which is what
  // Nitro's typed routes read and what a call site awaits. `validatedContext`
  // builds exactly the declared keys the walk was planned from, which is what
  // `ValidatedContext<S>` names.
  return defineEventHandler(async (event: H3Event<Request>) =>
    handler(event, (await validatedContext(event, plan)) as ValidatedContext<S>)
  ) as EventHandler<Request, Response>
}

/**
 * Observability predicate, process-side only: the issues a validation failure
 * raised, or `undefined` for "not a validation failure". Reads a symbol
 * marker and nothing else; the marker never reaches the wire. Carried over
 * from v1 unchanged, including everything the README says about what a marked
 * error does and does not tell you.
 *
 * **The signature is final; the body is not.** It throws until the
 * observability read lands, so the type surface can be built and
 * compiler-asserted without a half-written implementation pretending to work.
 */
export function recognizeValidationError(
  _error: unknown
): ValidationErrorData | undefined {
  throw new Error('not implemented')
}
