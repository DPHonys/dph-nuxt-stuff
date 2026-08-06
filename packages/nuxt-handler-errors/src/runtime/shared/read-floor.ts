/**
 * The read path's guard, and the non-reactive surface over it.
 *
 * Side-agnostic in the strict sense — no `vue`, no `h3`, no `#app` — which is
 * what lets `./typed-fetch` reach it from both Nitro plugins. The reactive
 * sibling lives in `../app/composables/use-declared-error`, alone with the
 * `vue` import: `useDeclaredError` is a Vue composable, and colocating the two
 * here put Vue's reactivity system in every Nitro bundle for a `computed` the
 * server never calls.
 */

import type { AnyVariant } from '../types/catalogue'
import type { DeclaredErrorReader } from '../types/reader'
import { DECLARED_ERROR_KEY } from './wire'

/**
 * The guard, and the whole of the wire's shape floor. Presence of the marker
 * is not enough — the floor (string `tag`, number `status`) is checked too,
 * so a present-but-malformed marker reads as *undeclared*, the direction
 * every consumer already handles. `typeof`-based deliberately: it rejects a
 * function carrying the two properties, and the explicit `!== null` stops
 * `typeof null === 'object'` from reaching the property reads.
 *
 * Exported for the reactive sibling alone. It reaches no published specifier,
 * so it stays an implementation detail of the two readers over it.
 */
export function readFloor(error: unknown): AnyVariant | undefined {
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
