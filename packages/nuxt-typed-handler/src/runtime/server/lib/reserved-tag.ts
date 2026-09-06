import type { DeclaredError } from '@dphonys/nuxt-handler-errors/internals/server'

/** The tag of the built-in variant; no umbrella route may declare it. */
export const RESERVED_TAG = 'validation-failed'

// The compile guard's answer for a JavaScript caller: thrown at declaration,
// so the route never becomes servable.
export function assertNoReservedTag(declared: readonly DeclaredError[]): void {
  if (!declared.some((entry) => entry.tag === RESERVED_TAG)) return

  throw new Error(
    `[nuxt-typed-handler] The error tag "${RESERVED_TAG}" is reserved for the built-in validation variant. Rename the declared error.`
  )
}
