import type { DeclaredError } from '@dphonys/nuxt-handler-errors/internals/server'

/** The tag of the built-in variant; no umbrella route may declare it. */
export const RESERVED_TAG = 'validation-failed'

// At declaration, like the parent's foreign-copy guard: the route never
// becomes servable. The compile guard says the same thing; this is the
// answer a JavaScript caller gets.
export function assertNoReservedTag(
  declared: readonly DeclaredError[] | undefined
): void {
  if (declared?.some((entry) => entry.tag === RESERVED_TAG) !== true) return

  throw new Error(
    `[nuxt-typed-handler] The error tag "${RESERVED_TAG}" is reserved for the built-in validation variant. Rename the declared error.`
  )
}
