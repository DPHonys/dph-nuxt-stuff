/**
 * A declared route's `.safe` result really does keep the false arm
 * (SPEC.md §3.5).
 *
 * This is the **control for the undeclared collapse**, and without it that
 * assertion would pass just as well against a `TypedResult` that had degraded
 * to one arm for every route: `data` would then be reachable without branching
 * everywhere, and the safe channel would be typed as if failure were
 * impossible.
 *
 * Deliberately non-compiling. Expected: **`TS2339`**, naming `data`.
 */

import type { TypedApiErrors } from '../../../src/runtime/types'

declare module 'nitropack/types' {
  interface InternalApi {
    '/api/users/:id': { get: { id: string } }
  }
}

declare module '../../../src/runtime/types' {
  interface TypedApiErrors {
    '/api/users/:id': { get: { tag: 'user-not-found'; status: 404 } }
  }
}

type _MapIsAugmented = TypedApiErrors

const { data } = await $typedFetch.safe('/api/users/123')

export { data }
