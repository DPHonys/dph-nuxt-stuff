import { taggedOf } from '../../shared/errors/tagged'
import type { TaggedError } from '../../types/errors/tagged'

/**
 * The Tagged error a Known error carries, or `undefined` for "not a Known
 * error" - for an `error` hook, a middleware, or a Sentry `beforeSend`.
 *
 * ```ts
 * nitroApp.hooks.hook('error', (error) => {
 *   const tagged = recognizeKnownError(error)
 *
 *   if (tagged?._tag === 'validation-failed') return
 *   if (tagged !== undefined) return countExpected(tagged._tag)
 *   report(error)
 * })
 * ```
 *
 * It reads the error's own `data`, where a route's boundary put the Tagged
 * error. A callee's Known error that a caller let escape carries the callee's
 * whole body as its `data`, the tag one level further down, so it is not
 * recognised: it is the caller's bug, and keeps reporting as one.
 *
 * Takes an `Error` because that is what every hook hands over - Nitro
 * normalises through `createError` before `captureError` fires. A tracker's
 * `unknown` (Sentry's `hint.originalException`) is narrowed with
 * `instanceof Error` first.
 */
export function recognizeKnownError(error: Error): TaggedError | undefined {
  return 'data' in error ? taggedOf(error.data) : undefined
}
