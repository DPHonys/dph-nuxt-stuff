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
 * **No `@nuxt/kit` runtime may be reachable from here.** It is a locked
 * constraint of the aggregator seam, guarded by `test/unit/core-layering.test.ts`
 * rather than by convention.
 */
import type {
  EventHandler,
  EventHandlerRequest,
  EventHandlerResponse,
  H3Event,
} from 'h3'
import { defineEventHandler } from 'h3'
import { readValidationMarker } from '../shared/error-marker'
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
 * The issues a validation failure raised, or `undefined` for "not a validation
 * failure" - for a Nitro `error` hook or a Sentry `beforeSend`.
 *
 * ```ts
 * // server/plugins/observability.ts
 * export default defineNitroPlugin((nitroApp) => {
 *   nitroApp.hooks.hook('error', (error) => {
 *     // A request that failed validation: expected, not a bug.
 *     if (recognizeValidationError(error)) return
 *
 *     report(error)
 *   })
 * })
 * ```
 *
 * A value rather than a type predicate, so it pairs with the sibling package's
 * `recognizeKnownError` in one hook. The detail returned is what the wrapper
 * **raised**, not necessarily what the client received - the wire payload is a
 * separate object, and anything downstream is free to edit it.
 *
 * **What a marked error tells you, exactly.** It was raised by this package
 * **in this process**, and never arrived over a fetch. It is *not* necessarily
 * this route's own declaration failing: an `H3Error` propagates in-process by
 * identity, so a directly called handler, a `defineEventHandler` middleware or
 * any shared function running the wrapper's validation delivers a marked error
 * indistinguishable from this route's own throw. Two cases where the request
 * did not even answer `400`: an SWR revalidation (the hook fires while the
 * response was served `200` from cache) and a plugin or `unhandledRejection`
 * capture, which carry no `event` at all.
 *
 * **Only a `400` validation failure is marked** - including the body read this
 * package absorbs into a single `body` issue. Every developer mistake it
 * raises carries none: a `validate` that throws, and the `500` for outputs that
 * cannot merge. A marker meaning "raised by this package" would let a
 * well-meaning `if (recognizeValidationError(error)) return` swallow exactly
 * the bugs that must keep reporting.
 *
 * **There is deliberately no `unhandled === false` half**, unlike the sibling's
 * equivalent. `unhandled` means only *"the value reaching h3's outermost
 * adapter was not an H3Error"*; the one thing it discriminates - a marked
 * payload returning across the wire - is already impossible here, because this
 * marker is a non-serialized symbol rather than a field inside `data`, and
 * every local-call door (`$fetch`, `event.$fetch`, `event.fetch`, `localCall`)
 * serializes through a full request/response cycle. Adding the check would be
 * cargo cult, and it would not buy the in-process case either: an escaped
 * callee's failure arrives with `unhandled === false` too.
 */
export function recognizeValidationError(
  error: unknown
): ValidationErrorData | undefined {
  // The symbol and nothing else. Never `error.data` - that is the wire object,
  // and reading it would make the answer a statement about the response rather
  // than about the raise. Never `error.cause` at any depth either: a deliberate
  // re-wrap is the caller saying "this is my 500 now", and recognizing through
  // it would suppress a report they just chose to raise.
  return readValidationMarker(error)
}
