/**
 * The route fixture every type suite reads, hand-written where the emitter
 * would generate it. One file, because both maps are *global* declaration
 * merges - two suites declaring the same key would merge into the same
 * interface.
 */

import type { KnownApiErrors } from '../../src/runtime/types'

export interface User {
  id: string
  name: string
}

/** What `/api/users/:id` declares, on `get`. */
export type UserVariants =
  | { tag: 'forbidden'; status: 403; requiredRole: 'admin' | 'owner' }
  | { tag: 'userNotFound'; status: 404; userId: string }
  | { tag: 'userSuspended'; status: 403; until: string }

/** What `/api/chain/c` declares - one variant, so a single arm is exhaustive. */
export interface ChainVariant {
  tag: 'cGone'
  status: 410
  resource: string
}

/** Nitro's own interface, standing in for a generated `nitro-routes.d.ts`. */
declare module 'nitropack/types' {
  interface InternalApi {
    '/api/users/:id': { get: User }
    '/api/chain/c': { get: { ok: true } }
    '/api/boom': { get: { fine: boolean } }
  }
}

/** This module's map, keyed exactly as Nitro keys the interface above. */
declare module '../../src/runtime/types' {
  interface KnownApiErrors {
    '/api/users/:id': { get: UserVariants }
    '/api/chain/c': { get: ChainVariant }
    // The degradation lock's control: a route that declares nothing.
    '/api/boom': { get: never }
  }
}

/** Keeps the import above used; the augmentation needs the module named. */
export type MapIsAugmented = KnownApiErrors
