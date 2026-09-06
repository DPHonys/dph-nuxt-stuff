import { readFloor } from '../../shared/match-error'
import type { KnownVariant } from '../../types/known-error'

/**
 * The variant an error carries, or `undefined` for "not a known failure" -
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
 *
 * Takes an `Error` because that is what every hook hands over - Nitro
 * normalises through `createError` before `captureError` fires. A tracker's
 * `unknown` (Sentry's `hint.originalException`) is narrowed with
 * `instanceof Error` first.
 */
export function recognizeKnownError(error: Error): KnownVariant | undefined {
  return readFloor(error)
}
