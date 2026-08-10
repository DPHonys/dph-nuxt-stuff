/**
 * The wire as a type, and the two reader signatures over it. The only file
 * here that touches `vue` — the reactive sibling is the whole reason for the
 * dependency.
 */

import type { ComputedRef, Ref } from 'vue'
import type { AnyVariant } from './catalogue'

/**
 * The reserved key's type, derived from the exported constant so the literal
 * is written once. A `typeof import(…)` in a type position emits no runtime
 * import.
 */
export type DeclaredErrorKey =
  (typeof import('../shared/wire'))['DECLARED_ERROR_KEY']

/**
 * Nitro's production error body with the marker inside `data` — the only
 * extension point across both hops. ofetch's `FetchError.data` is the whole
 * response body, so the variant sits at `err.data.data.__declaredError__`.
 */
export interface DeclaredErrorBody<E extends AnyVariant> {
  error: true
  url: string
  statusCode: number
  statusMessage: string
  message: string
  data: { [K in DeclaredErrorKey]: E }
}

/**
 * The error value the reader's first overload matches:
 * `NuxtError<DeclaredErrorBody<E>>` reduced to the one property walked.
 * Structural because `NuxtError` lives behind `#app`, which the server and
 * `shared/` contexts lack — and it keeps the degraded overload reachable: an
 * undeclared route's `data?: unknown` is not assignable here for any `E`, so
 * it falls to the second overload instead of matching with `E` widened.
 */
export interface DeclaredErrorCarrier<E extends AnyVariant> {
  data?: DeclaredErrorBody<E> | undefined
}

/**
 * The value form of the reader — the only read path; no call site ever writes
 * the wire key. A typed error gives the union back; anything else degrades to
 * the wire's shape floor. `undefined` means "not a declared failure",
 * covering no marker, a malformed marker and a production-stripped response
 * alike. The union stays closed (widening was measured to cost all
 * narrowing), so under deploy skew an unknown tag types as a member it is not.
 */
export interface DeclaredErrorReader {
  <E extends AnyVariant>(
    error: DeclaredErrorCarrier<E> | null | undefined
  ): E | undefined
  (error: unknown): AnyVariant | undefined
}

/**
 * The reactive sibling: the same answer, as a computed. Narrowing must land
 * on a local `const` (`const current = failure.value`) — a `.value` read does
 * not carry a narrowing across, and template narrowing is weaker still.
 *
 * The parameter is Vue's own `Ref`, not a read-only view: property
 * assignability is covariant regardless of writability, so `Ref`,
 * `ComputedRef`, `ShallowRef` and `Readonly<Ref>` all match this as-is.
 */
export interface UseDeclaredError {
  <E extends AnyVariant>(
    error: Ref<DeclaredErrorCarrier<E> | null | undefined>
  ): ComputedRef<E | undefined>
  (error: Ref<unknown>): ComputedRef<AnyVariant | undefined>
}
