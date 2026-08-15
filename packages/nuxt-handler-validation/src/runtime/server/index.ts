/**
 * The `@dphonys/nuxt-handler-validation/server` entry - the whole runtime
 * surface. Both names are auto-imported inside `server/`, the same ambient
 * position as `defineEventHandler`, and this entry is the explicit door for
 * everywhere auto-imports do not reach (Nitro plugins and tasks, tests,
 * non-Nuxt Nitro consumers).
 *
 * Two exports. v1 had three; `defineValidation` is gone, because the unit of
 * reuse is now the schema value itself - see DESIGN.md.
 *
 * **The signatures are final; the bodies are not.** Both throw until the
 * runtime core lands, so the type surface can be built, published and
 * compiler-asserted without a half-written implementation pretending to work.
 */
import type {
  EventHandler,
  EventHandlerRequest,
  EventHandlerResponse,
  H3Event,
} from 'h3'
import type {
  ValidatedContext,
  ValidationErrorData,
  ValidationSchemas,
} from '../types'
import type { ValidationSchemasGuard } from '../types/internal'

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
 */
// `Response` has no default type parameter on purpose (the sibling's rule):
// an explicit type argument becomes an arity error instead of silently
// collapsing the success type to `any`.
export function defineValidatedEventHandler<
  const S extends ValidationSchemas,
  Response extends EventHandlerResponse,
  Request extends EventHandlerRequest = EventHandlerRequest,
>(
  _options: { validate: S & ValidationSchemasGuard<S> },
  _handler: (
    event: H3Event<Request>,
    validated: ValidatedContext<S>
  ) => Response
): EventHandler<Request, Response> {
  throw new Error('not implemented')
}

/**
 * Observability predicate, process-side only: the issues a validation failure
 * raised, or `undefined` for "not a validation failure". Reads a symbol
 * marker and nothing else; the marker never reaches the wire. Carried over
 * from v1 unchanged, including everything the README says about what a marked
 * error does and does not tell you.
 */
export function recognizeValidationError(
  _error: unknown
): ValidationErrorData | undefined {
  throw new Error('not implemented')
}
