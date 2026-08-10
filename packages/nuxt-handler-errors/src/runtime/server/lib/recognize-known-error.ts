import { readFloor } from '../../shared/match-error'
import type { KnownVariant } from '../../types/known-error'

/**
 * The variant an error carries, or `undefined` for "not a known failure" —
 * for an `error` hook or a Sentry `beforeSend`.
 *
 * ```ts
 * nitroApp.hooks.hook('error', (error) => {
 *   if (recognizeKnownError(error) && error.unhandled === false) return
 *   report(error)
 * })
 * ```
 *
 * Keep the `unhandled === false` half: an *escaped* callee failure carries a
 * marker too, and that one is a caller bug that must keep reporting.
 */
export function recognizeKnownError(error: unknown): KnownVariant | undefined {
  return readFloor(error)
}
