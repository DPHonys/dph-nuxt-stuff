/**
 * The false arm carries a real **discriminated union**, not SPEC.md §5.3's
 * shape floor and not TypeScript's error type (SPEC-AMENDMENTS item 9).
 *
 * A payload field is unreachable until the `tag` has been narrowed, which is
 * the whole point of the closed union: a widened one — `Declared | { tag:
 * string & {}, status: number }` — was measured to cost not a `default` branch
 * but **all** narrowing, and an `any` here would let this line through.
 *
 * Deliberately non-compiling. Expected: **`TS2339`**, naming `userId`.
 */

import type { TypedApiErrors } from '../../../src/runtime/types'

declare module 'nitropack/types' {
  interface InternalApi {
    '/api/users/:id': { get: { id: string } }
  }
}

declare module '../../../src/runtime/types' {
  interface TypedApiErrors {
    '/api/users/:id': {
      get:
        | { tag: 'user-not-found'; status: 404; userId: string }
        | { tag: 'user-suspended'; status: 403; until: string }
    }
  }
}

type _MapIsAugmented = TypedApiErrors

const result = await $typedFetch.safe('/api/users/123')

export const leaked = result.ok ? '' : result.error.userId
