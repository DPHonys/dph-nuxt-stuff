/**
 * The read path: the wire's shape floor, and the matcher over it.
 *
 * Shared in the strict sense — one matcher serves both runtimes, because a
 * server-side `.try` normalisation lands the carrier at exactly the client
 * chain's depth. The only import beyond our own wire is `unref`, a pure
 * function; no reactivity is created here and no `#app` or `h3` specifier is
 * reachable from this file.
 */

import type { NuxtError } from 'nuxt/app'
import type { MaybeRef } from 'vue'
import { unref } from 'vue'
import type { KnownVariant } from '../types/known-error'
import type { Fallback, MatchError } from '../types/matcher'
import { KNOWN_ERROR_KEY } from './wire'

/**
 * The marker out of one container, checked against the whole floor. Presence is
 * not enough: `tag: string` and `status: number` are verified, so a
 * present-but-malformed marker reads as *unknown* — the direction every
 * consumer already handles. `typeof`-based deliberately, and the explicit
 * `!== null` stops `typeof null === 'object'` reaching the property reads.
 */
function readMarker(container: unknown): KnownVariant | undefined {
  const marker = (container as Record<string, unknown> | null | undefined)?.[
    KNOWN_ERROR_KEY
  ]

  return typeof marker === 'object' &&
    marker !== null &&
    typeof (marker as KnownVariant).tag === 'string' &&
    typeof (marker as KnownVariant).status === 'number'
    ? (marker as KnownVariant)
    : undefined
}

/**
 * The variant an error carries, or `undefined` for "not a known failure".
 *
 * **The marker sits at two depths and both are read here.** `data.<marker>` is
 * the raise site — the server's own thrown `H3Error`. `data.data.<marker>` is
 * a fetched carrier, where the outer `data` is ofetch's parsed response body
 * and the inner one is Nitro's serialized `error.data`; both `data`s are the
 * framework's.
 */
export function readFloor(error: unknown): KnownVariant | undefined {
  const data = (error as { data?: unknown } | null | undefined)?.data

  return (
    readMarker(data) ?? readMarker((data as { data?: unknown } | null)?.data)
  )
}

/**
 * Handle a failure: the declared arm if this call site knows the tag, the
 * fallback otherwise. Absorbs the `if (error)` — a nullish error is no
 * failure, so nothing is called at all.
 *
 * The ref is read **once, at call time**. The reactive form is composition, not
 * another function: `watch(error, () => matchError(error, …), { immediate:
 * true })`.
 */
export const matchError: MatchError = (
  error: MaybeRef<unknown>,
  arms: Record<string, unknown>,
  fallback: Fallback
): void => {
  const err: unknown = unref(error)
  if (err === null || err === undefined) return

  const variant = readFloor(err)

  // Own-property only: a tag like `toString` would otherwise reach the arms
  // object's prototype and be called as an arm.
  const arm =
    variant !== undefined && Object.hasOwn(arms, variant.tag)
      ? arms[variant.tag]
      : undefined

  if (variant !== undefined && typeof arm === 'function') {
    ;(arm as (v: KnownVariant) => void)(variant)
    return
  }

  fallback(err as NuxtError, variant)
}
