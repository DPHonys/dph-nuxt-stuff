import { readValidationMarker } from '../../shared/error-marker'
import type { ValidationErrorData } from '../../types/wire'

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
 * raises carries none: a `validate` that throws, the declaration-time guards,
 * and the `500` for outputs that cannot merge. A marker meaning "raised by this
 * package" would let a well-meaning `if (recognizeValidationError(error))
 * return` swallow exactly the bugs that must keep reporting.
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
