/**
 * The read path: one guard, and the two surfaces over it.
 *
 * The only file in the package importing `vue`, which is what keeps the
 * dependency's blast radius visible — it stays a plain caret-ranged dependency
 * for instance identity: two physical copies of Vue are two reactivity
 * systems, and a `computed` from one does not track a ref owned by the other.
 */

import { computed } from 'vue'
import type { Ref } from 'vue'
import type {
  AnyVariant,
  DeclaredErrorReader,
  UseDeclaredError,
} from '../types'
import { DECLARED_ERROR_KEY } from './wire'

/**
 * The guard, and the whole of the wire's shape floor. Presence of the marker
 * is not enough — the floor (string `tag`, number `status`) is checked too,
 * so a present-but-malformed marker reads as *undeclared*, the direction
 * every consumer already handles. `typeof`-based deliberately: it rejects a
 * function carrying the two properties, and the explicit `!== null` stops
 * `typeof null === 'object'` from reaching the property reads.
 */
function readFloor(error: unknown): AnyVariant | undefined {
  const marker = (
    error as { data?: { data?: Record<string, unknown> } } | null | undefined
  )?.data?.data?.[DECLARED_ERROR_KEY]

  return typeof marker === 'object' &&
    marker !== null &&
    typeof (marker as AnyVariant).tag === 'string' &&
    typeof (marker as AnyVariant).status === 'number'
    ? (marker as AnyVariant)
    : undefined
}

/**
 * Read the declared variant out of an error value, or `undefined` — "not a
 * declared failure" — if there is not one. Overloads, `undefined`'s meaning
 * and deploy skew are documented on {@link DeclaredErrorReader}.
 *
 * The assertion is to the interface itself rather than through `never`: the
 * implementation is still checked for comparability, so a `readFloor` that
 * stopped answering the floor would fail here. `as never` would not.
 */
export const declaredError: DeclaredErrorReader =
  readFloor as DeclaredErrorReader

/**
 * The reactive sibling of {@link declaredError}, for templates. Narrow on a
 * local `const current = failure.value` — see {@link UseDeclaredError} for
 * why that is not a style preference.
 */
export const useDeclaredError: UseDeclaredError = ((error: Ref<unknown>) =>
  computed(() => readFloor(error.value))) as UseDeclaredError
