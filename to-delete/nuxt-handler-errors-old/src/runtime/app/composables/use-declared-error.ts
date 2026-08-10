/**
 * `useDeclaredError`: the reactive half of the read path, for templates.
 *
 * The only file in the package importing `vue`, which is what keeps the
 * dependency's blast radius visible — it stays a plain caret-ranged dependency
 * for instance identity: two physical copies of Vue are two reactivity
 * systems, and a `computed` from one does not track a ref owned by the other.
 *
 * App-side, and reached the way its sibling `./use-typed-fetch` is: through
 * the `addImports` registration in `src/module.ts`, with `#imports` to write
 * the import out. Deliberately on no published specifier — a `/app` entry
 * point would carry this one function forever, because the composables it
 * belongs beside import `#app` and can never join it.
 */

import { computed } from 'vue'
import type { Ref } from 'vue'
import { readFloor } from '../../shared/read-floor'
import type { UseDeclaredError } from '../../types/reader'

/**
 * The reactive sibling of `declaredError`. Narrow on a local
 * `const current = failure.value` — see {@link UseDeclaredError} for why that
 * is not a style preference.
 */
export const useDeclaredError: UseDeclaredError = ((error: Ref<unknown>) =>
  computed(() => readFloor(error.value))) as UseDeclaredError
