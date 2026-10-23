/**
 * The route fixture the request-typing suites read, hand-written where the
 * module's emitter would generate it (the generated template arrives with
 * ticket 03). One file, because all three maps are *global* declaration
 * merges - two suites declaring the same key would merge into the same
 * interface.
 *
 * Fifty-two routes: the seven the contract rows read, plus forty-five synthetic
 * ones, so the stack-depth rules are exercised at the size the ticket 10
 * prototype measured (no `TS2321`, no `TS2589`).
 */

import type { KnownApiErrors } from '@dphonys/nuxt-handler-errors/types'
import type {
  KnownApiRequestInputs,
  ValidationFailed,
} from '../../src/runtime/types'

/** `/api/users` on `post`: a transforming body (the wire sends `age` as a
 * string) and a tuple-composed query (both elements parse the whole raw
 * query, so the wire must satisfy their intersection). */
export interface UserCreateInput {
  body: { name: string; age: string }
  query: { team: string } & { page?: number }
}

export interface UserCreated {
  id: string
  team: string
  page: number
  ageIsNumber: number
}

/** `/api/users` on `get`: an all-optional query schema stays optional. */
export interface UserListInput {
  query: { search?: string; limit?: number }
}

export interface UserList {
  users: string[]
}

/** `/api/items/:id`: a `default` (method-less) handler declaring `body`. */
export interface ItemInput {
  route: { id: string }
  body: { qty: number }
}

export interface Item {
  item: string
  qty: number
}

/** `/api/params-only/:slug`: declares `route` alone - `body`/`query` are undeclared. */
export interface SlugInput {
  route: { slug: string }
}

/** `/api/errors-only`: declares `errors` only, so its input is the empty
 * record the emitter computes from an absent `input`. */

export interface ErrorsOnlyInput {}

/** `/api/output-only`: declares `output` only, so it validates nothing - the
 * empty Request input of a route with no sources, and no built-in variant. */

export interface OutputOnlyInput {}

export interface Forbidden {
  tag: 'forbidden'
  status: 403
}

export interface Gone {
  tag: 'gone'
  status: 410
}

/** Nitro's own interface, standing in for a generated `nitro-routes.d.ts`. */
declare module 'nitropack/types' {
  interface InternalApi {
    '/api/users': {
      post: UserCreated
      get: UserList
    }
    '/api/items/:id': {
      default: Item
    }
    '/api/plain': {
      get: { plain: true }
    }
    '/api/errors-only': {
      post: { ok: true }
    }
    '/api/output-only': {
      post: { id: string; name: string }
    }
    '/api/params-only/:slug': {
      post: { slug: string }
    }
    '/api/multi': {
      post: UserCreated | Item
    }
    '/api/gen/0/:id': {
      get: { plain: true }
      post: UserCreated
    }
    '/api/gen/1/:id': {
      get: UserList
      post: UserCreated
    }
    '/api/gen/2/:id': {
      get: { plain: true }
      post: UserCreated
    }
    '/api/gen/3/:id': {
      get: UserList
      post: UserCreated
    }
    '/api/gen/4/:id': {
      get: { plain: true }
      post: UserCreated
    }
    '/api/gen/5/:id': {
      get: UserList
      post: UserCreated
    }
    '/api/gen/6/:id': {
      get: { plain: true }
      post: UserCreated
    }
    '/api/gen/7/:id': {
      get: UserList
      post: UserCreated
    }
    '/api/gen/8/:id': {
      get: { plain: true }
      post: UserCreated
    }
    '/api/gen/9/:id': {
      get: UserList
      post: UserCreated
    }
    '/api/gen/10/:id': {
      get: { plain: true }
      post: UserCreated
    }
    '/api/gen/11/:id': {
      get: UserList
      post: UserCreated
    }
    '/api/gen/12/:id': {
      get: { plain: true }
      post: UserCreated
    }
    '/api/gen/13/:id': {
      get: UserList
      post: UserCreated
    }
    '/api/gen/14/:id': {
      get: { plain: true }
      post: UserCreated
    }
    '/api/gen/15/:id': {
      get: UserList
      post: UserCreated
    }
    '/api/gen/16/:id': {
      get: { plain: true }
      post: UserCreated
    }
    '/api/gen/17/:id': {
      get: UserList
      post: UserCreated
    }
    '/api/gen/18/:id': {
      get: { plain: true }
      post: UserCreated
    }
    '/api/gen/19/:id': {
      get: UserList
      post: UserCreated
    }
    '/api/gen/20/:id': {
      get: { plain: true }
      post: UserCreated
    }
    '/api/gen/21/:id': {
      get: UserList
      post: UserCreated
    }
    '/api/gen/22/:id': {
      get: { plain: true }
      post: UserCreated
    }
    '/api/gen/23/:id': {
      get: UserList
      post: UserCreated
    }
    '/api/gen/24/:id': {
      get: { plain: true }
      post: UserCreated
    }
    '/api/gen/25/:id': {
      get: UserList
      post: UserCreated
    }
    '/api/gen/26/:id': {
      get: { plain: true }
      post: UserCreated
    }
    '/api/gen/27/:id': {
      get: UserList
      post: UserCreated
    }
    '/api/gen/28/:id': {
      get: { plain: true }
      post: UserCreated
    }
    '/api/gen/29/:id': {
      get: UserList
      post: UserCreated
    }
    '/api/gen/30/:id': {
      get: { plain: true }
      post: UserCreated
    }
    '/api/gen/31/:id': {
      get: UserList
      post: UserCreated
    }
    '/api/gen/32/:id': {
      get: { plain: true }
      post: UserCreated
    }
    '/api/gen/33/:id': {
      get: UserList
      post: UserCreated
    }
    '/api/gen/34/:id': {
      get: { plain: true }
      post: UserCreated
    }
    '/api/gen/35/:id': {
      get: UserList
      post: UserCreated
    }
    '/api/gen/36/:id': {
      get: { plain: true }
      post: UserCreated
    }
    '/api/gen/37/:id': {
      get: UserList
      post: UserCreated
    }
    '/api/gen/38/:id': {
      get: { plain: true }
      post: UserCreated
    }
    '/api/gen/39/:id': {
      get: UserList
      post: UserCreated
    }
    '/api/gen/40/:id': {
      get: { plain: true }
      post: UserCreated
    }
    '/api/gen/41/:id': {
      get: UserList
      post: UserCreated
    }
    '/api/gen/42/:id': {
      get: { plain: true }
      post: UserCreated
    }
    '/api/gen/43/:id': {
      get: UserList
      post: UserCreated
    }
    '/api/gen/44/:id': {
      get: { plain: true }
      post: UserCreated
    }
  }
}

/** The errors parent's map, keyed exactly as Nitro keys the interface above.
 * Every validating route carries the built-in variant, because the wrapper's
 * `__knownErrors__` slot includes it. */
declare module '@dphonys/nuxt-handler-errors/types' {
  interface KnownApiErrors {
    '/api/users': {
      post: Forbidden | ValidationFailed
      get: ValidationFailed
    }
    '/api/items/:id': {
      default: ValidationFailed
    }
    '/api/plain': {
      get: never
    }
    '/api/errors-only': {
      post: Gone
    }
    '/api/output-only': {
      post: never
    }
    '/api/params-only/:slug': {
      post: ValidationFailed
    }
    '/api/multi': {
      post: Forbidden | ValidationFailed
    }
    '/api/gen/0/:id': {
      get: never
      post: Forbidden | ValidationFailed
    }
    '/api/gen/1/:id': {
      get: ValidationFailed
      post: Forbidden | ValidationFailed
    }
    '/api/gen/2/:id': {
      get: never
      post: Forbidden | ValidationFailed
    }
    '/api/gen/3/:id': {
      get: ValidationFailed
      post: Forbidden | ValidationFailed
    }
    '/api/gen/4/:id': {
      get: never
      post: Forbidden | ValidationFailed
    }
    '/api/gen/5/:id': {
      get: ValidationFailed
      post: Forbidden | ValidationFailed
    }
    '/api/gen/6/:id': {
      get: never
      post: Forbidden | ValidationFailed
    }
    '/api/gen/7/:id': {
      get: ValidationFailed
      post: Forbidden | ValidationFailed
    }
    '/api/gen/8/:id': {
      get: never
      post: Forbidden | ValidationFailed
    }
    '/api/gen/9/:id': {
      get: ValidationFailed
      post: Forbidden | ValidationFailed
    }
    '/api/gen/10/:id': {
      get: never
      post: Forbidden | ValidationFailed
    }
    '/api/gen/11/:id': {
      get: ValidationFailed
      post: Forbidden | ValidationFailed
    }
    '/api/gen/12/:id': {
      get: never
      post: Forbidden | ValidationFailed
    }
    '/api/gen/13/:id': {
      get: ValidationFailed
      post: Forbidden | ValidationFailed
    }
    '/api/gen/14/:id': {
      get: never
      post: Forbidden | ValidationFailed
    }
    '/api/gen/15/:id': {
      get: ValidationFailed
      post: Forbidden | ValidationFailed
    }
    '/api/gen/16/:id': {
      get: never
      post: Forbidden | ValidationFailed
    }
    '/api/gen/17/:id': {
      get: ValidationFailed
      post: Forbidden | ValidationFailed
    }
    '/api/gen/18/:id': {
      get: never
      post: Forbidden | ValidationFailed
    }
    '/api/gen/19/:id': {
      get: ValidationFailed
      post: Forbidden | ValidationFailed
    }
    '/api/gen/20/:id': {
      get: never
      post: Forbidden | ValidationFailed
    }
    '/api/gen/21/:id': {
      get: ValidationFailed
      post: Forbidden | ValidationFailed
    }
    '/api/gen/22/:id': {
      get: never
      post: Forbidden | ValidationFailed
    }
    '/api/gen/23/:id': {
      get: ValidationFailed
      post: Forbidden | ValidationFailed
    }
    '/api/gen/24/:id': {
      get: never
      post: Forbidden | ValidationFailed
    }
    '/api/gen/25/:id': {
      get: ValidationFailed
      post: Forbidden | ValidationFailed
    }
    '/api/gen/26/:id': {
      get: never
      post: Forbidden | ValidationFailed
    }
    '/api/gen/27/:id': {
      get: ValidationFailed
      post: Forbidden | ValidationFailed
    }
    '/api/gen/28/:id': {
      get: never
      post: Forbidden | ValidationFailed
    }
    '/api/gen/29/:id': {
      get: ValidationFailed
      post: Forbidden | ValidationFailed
    }
    '/api/gen/30/:id': {
      get: never
      post: Forbidden | ValidationFailed
    }
    '/api/gen/31/:id': {
      get: ValidationFailed
      post: Forbidden | ValidationFailed
    }
    '/api/gen/32/:id': {
      get: never
      post: Forbidden | ValidationFailed
    }
    '/api/gen/33/:id': {
      get: ValidationFailed
      post: Forbidden | ValidationFailed
    }
    '/api/gen/34/:id': {
      get: never
      post: Forbidden | ValidationFailed
    }
    '/api/gen/35/:id': {
      get: ValidationFailed
      post: Forbidden | ValidationFailed
    }
    '/api/gen/36/:id': {
      get: never
      post: Forbidden | ValidationFailed
    }
    '/api/gen/37/:id': {
      get: ValidationFailed
      post: Forbidden | ValidationFailed
    }
    '/api/gen/38/:id': {
      get: never
      post: Forbidden | ValidationFailed
    }
    '/api/gen/39/:id': {
      get: ValidationFailed
      post: Forbidden | ValidationFailed
    }
    '/api/gen/40/:id': {
      get: never
      post: Forbidden | ValidationFailed
    }
    '/api/gen/41/:id': {
      get: ValidationFailed
      post: Forbidden | ValidationFailed
    }
    '/api/gen/42/:id': {
      get: never
      post: Forbidden | ValidationFailed
    }
    '/api/gen/43/:id': {
      get: ValidationFailed
      post: Forbidden | ValidationFailed
    }
    '/api/gen/44/:id': {
      get: never
      post: Forbidden | ValidationFailed
    }
  }
}

/** This module's map, keyed exactly as Nitro keys the interface above - the
 * shape ticket 03's emitted template will write for real. */
declare module '../../src/runtime/types' {
  interface KnownApiRequestInputs {
    '/api/users': {
      post: UserCreateInput
      get: UserListInput
    }
    '/api/items/:id': {
      default: ItemInput
    }
    '/api/plain': {
      get: never
    }
    '/api/errors-only': {
      post: ErrorsOnlyInput
    }
    '/api/output-only': {
      post: OutputOnlyInput
    }
    '/api/params-only/:slug': {
      post: SlugInput
    }
    '/api/multi': {
      post: UserCreateInput | ItemInput
    }
    '/api/gen/0/:id': {
      get: never
      post: UserCreateInput
    }
    '/api/gen/1/:id': {
      get: UserListInput
      post: UserCreateInput
    }
    '/api/gen/2/:id': {
      get: never
      post: UserCreateInput
    }
    '/api/gen/3/:id': {
      get: UserListInput
      post: UserCreateInput
    }
    '/api/gen/4/:id': {
      get: never
      post: UserCreateInput
    }
    '/api/gen/5/:id': {
      get: UserListInput
      post: UserCreateInput
    }
    '/api/gen/6/:id': {
      get: never
      post: UserCreateInput
    }
    '/api/gen/7/:id': {
      get: UserListInput
      post: UserCreateInput
    }
    '/api/gen/8/:id': {
      get: never
      post: UserCreateInput
    }
    '/api/gen/9/:id': {
      get: UserListInput
      post: UserCreateInput
    }
    '/api/gen/10/:id': {
      get: never
      post: UserCreateInput
    }
    '/api/gen/11/:id': {
      get: UserListInput
      post: UserCreateInput
    }
    '/api/gen/12/:id': {
      get: never
      post: UserCreateInput
    }
    '/api/gen/13/:id': {
      get: UserListInput
      post: UserCreateInput
    }
    '/api/gen/14/:id': {
      get: never
      post: UserCreateInput
    }
    '/api/gen/15/:id': {
      get: UserListInput
      post: UserCreateInput
    }
    '/api/gen/16/:id': {
      get: never
      post: UserCreateInput
    }
    '/api/gen/17/:id': {
      get: UserListInput
      post: UserCreateInput
    }
    '/api/gen/18/:id': {
      get: never
      post: UserCreateInput
    }
    '/api/gen/19/:id': {
      get: UserListInput
      post: UserCreateInput
    }
    '/api/gen/20/:id': {
      get: never
      post: UserCreateInput
    }
    '/api/gen/21/:id': {
      get: UserListInput
      post: UserCreateInput
    }
    '/api/gen/22/:id': {
      get: never
      post: UserCreateInput
    }
    '/api/gen/23/:id': {
      get: UserListInput
      post: UserCreateInput
    }
    '/api/gen/24/:id': {
      get: never
      post: UserCreateInput
    }
    '/api/gen/25/:id': {
      get: UserListInput
      post: UserCreateInput
    }
    '/api/gen/26/:id': {
      get: never
      post: UserCreateInput
    }
    '/api/gen/27/:id': {
      get: UserListInput
      post: UserCreateInput
    }
    '/api/gen/28/:id': {
      get: never
      post: UserCreateInput
    }
    '/api/gen/29/:id': {
      get: UserListInput
      post: UserCreateInput
    }
    '/api/gen/30/:id': {
      get: never
      post: UserCreateInput
    }
    '/api/gen/31/:id': {
      get: UserListInput
      post: UserCreateInput
    }
    '/api/gen/32/:id': {
      get: never
      post: UserCreateInput
    }
    '/api/gen/33/:id': {
      get: UserListInput
      post: UserCreateInput
    }
    '/api/gen/34/:id': {
      get: never
      post: UserCreateInput
    }
    '/api/gen/35/:id': {
      get: UserListInput
      post: UserCreateInput
    }
    '/api/gen/36/:id': {
      get: never
      post: UserCreateInput
    }
    '/api/gen/37/:id': {
      get: UserListInput
      post: UserCreateInput
    }
    '/api/gen/38/:id': {
      get: never
      post: UserCreateInput
    }
    '/api/gen/39/:id': {
      get: UserListInput
      post: UserCreateInput
    }
    '/api/gen/40/:id': {
      get: never
      post: UserCreateInput
    }
    '/api/gen/41/:id': {
      get: UserListInput
      post: UserCreateInput
    }
    '/api/gen/42/:id': {
      get: never
      post: UserCreateInput
    }
    '/api/gen/43/:id': {
      get: UserListInput
      post: UserCreateInput
    }
    '/api/gen/44/:id': {
      get: never
      post: UserCreateInput
    }
  }
}

/** Keeps the imports above used; each augmentation needs its module named. */
export type MapsAreAugmented = [KnownApiErrors, KnownApiRequestInputs]
