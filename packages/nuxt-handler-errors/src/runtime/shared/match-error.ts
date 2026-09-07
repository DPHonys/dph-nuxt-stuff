import type { NuxtError } from 'nuxt/app'
import type { MaybeRef } from 'vue'
import { unref } from 'vue'
import type { KnownVariant } from '../types/known-error'
import type { Arms, Fallback, MatchError } from '../types/matcher'
import { isMarkedError, markerOf } from './wire'

/**
 * The variant an error carries, or `undefined` for "not a known failure".
 * Reads both wire depths: `data.<marker>` (the raise site's own throw) and
 * `data.data.<marker>` (a fetched carrier). Every error surface this module
 * meets - h3's, Nuxt's, ofetch's - throws an `Error`; the marker parse
 * decides what is on it.
 */
export function readFloor(error: Error): KnownVariant | undefined {
  return isMarkedError(error) ? markerOf(error) : undefined
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
export const matchError: MatchError = dispatchOnFloor

/**
 * The matcher's one runtime signature, which every overload of `matchError`
 * narrows: the arms are keyed by whatever tag the wire carries.
 */
export function dispatchOnFloor(
  error: MaybeRef<NuxtError | null | undefined>,
  arms: Arms<KnownVariant>,
  fallback: Fallback
): void {
  const err = unref(error)
  if (err === null || err === undefined) return

  const variant = readFloor(err)

  // Own-property only: a tag like `toString` would otherwise reach the arms
  // object's prototype and be called as an arm.
  const arm =
    variant !== undefined && Object.hasOwn(arms, variant.tag)
      ? arms[variant.tag]
      : undefined

  if (variant !== undefined && arm !== undefined) {
    arm(variant)
    return
  }

  fallback(err, variant)
}
