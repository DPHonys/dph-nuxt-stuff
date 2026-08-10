/**
 * The observability read: "is this a failure the server declared, and which
 * one?" — the one question an `error` hook or a Sentry `beforeSend` needs to
 * answer, and the whole of what this module offers observability.
 *
 * **The module suppresses nothing and never will.** Nitro's `captureError`
 * fires the `error` hook unconditionally, with no cancellation and *before* the
 * error-handler chain runs, so channel stripping is structurally invisible here:
 * a known failure is marked for observability whether or not its response went
 * out stripped. Whether known failures reach the tracker is the integration's
 * one-line choice.
 */

import { readFloor } from '../../shared/match-error'
import type { KnownVariant } from '../../types/known-error'

/**
 * The variant an error carries, or `undefined` for "not a known failure".
 *
 * Reads **both marker depths**, because it is `readFloor` — the same floor read
 * `matchError` dispatches on, exported under the name that says what a server
 * caller wants it for. Depth 1 (`data.<marker>`) is the route's own thrown
 * error, which is the shape the `error` hook sees; depth 2
 * (`data.data.<marker>`) is a fetched carrier from a server-to-server call. A
 * present-but-malformed marker reads as unrecognized.
 *
 * The recipe — filter a route's *own* declared failures, keep the bugs:
 *
 * ```ts
 * // nitro plugin
 * nitroApp.hooks.hook('error', (error) => {
 *   if (recognizeKnownError(error) && error.unhandled === false) return
 *   report(error)
 * })
 *
 * // or Sentry
 * Sentry.init({
 *   beforeSend: (event, hint) =>
 *     recognizeKnownError(hint.originalException) &&
 *     (hint.originalException as { unhandled?: boolean }).unhandled === false
 *       ? null
 *       : event,
 * })
 * ```
 *
 * `unhandled === false` is the load-bearing half: an *escaped* callee failure
 * reaches the hook carrying a marker too, at depth 2 with `unhandled` set, and
 * that one is the caller bug it looks like — it must keep reporting.
 */
export function recognizeKnownError(error: unknown): KnownVariant | undefined {
  return readFloor(error)
}
