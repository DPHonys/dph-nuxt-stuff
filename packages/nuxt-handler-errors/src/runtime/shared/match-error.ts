import type { NuxtError } from 'nuxt/app'
import type { MaybeRef } from 'vue'
import { unref } from 'vue'
import type { KnownVariant } from '../types/known-error'
import type { Fallback, MatchError } from '../types/matcher'
import { KNOWN_ERROR_KEY } from './wire'

// Presence is not enough: `tag` and `status` are verified, so a
// present-but-malformed marker reads as unknown.
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
 * Reads both wire depths: `data.<marker>` (the raise site's own throw) and
 * `data.data.<marker>` (a fetched carrier).
 */
export function readFloor(error: unknown): KnownVariant | undefined {
  const data = (error as { data?: unknown } | null | undefined)?.data

  return (
    readMarker(data) ?? readMarker((data as { data?: unknown } | null)?.data)
  )
}

/**
 * Handle a failure: the declared arm if this call site knows the tag, the
 * fallback otherwise. A nullish error is no failure - nothing is called at
 * all. The ref is read once, at call time; the reactive form is
 * `watch(error, () => matchError(error, …))`.
 *
 * ```ts
 * const { data, error } = await useCheckedFetch('/api/users/:id')
 *
 * matchError(
 *   error,
 *   {
 *     'user-not-found': (e) => notFound(e.userId),
 *   },
 *   (err) => showError(err)
 * )
 * ```
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
