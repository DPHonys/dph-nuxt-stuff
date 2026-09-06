import { defineEventHandler } from 'h3'
import { it } from 'vitest'
import { matchError } from '../../src/runtime/shared'
import type { CheckedFetch } from '../../src/runtime/types'
import type { MapIsAugmented, User } from './routes'

/**
 * The fetch surfaces' compile-time contract over a hand-written stand-in for
 * the generated map, asserted by the compiler under `pnpm typecheck`.
 * Narrowing is asserted with explicitly-typed consts: property access on
 * `never` compiles, so a call site can keep passing while narrowing is gone.
 */

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false

type Expect<T extends true> = T

// The suites' route fixture really merged into the generated-map interface.
type _MapCarriesTheFixtureRoutes = Expect<
  Equal<MapIsAugmented['/api/boom']['get'], never>
>

declare function snack(message: string): void
declare function report(message: string): void
declare function showError(error: unknown): void
declare function notFound(id: string): void
declare function blocked(until: string): void
declare function render(user: User): void

// ---------------------------------------------------------------------------
// The imperative surface - inside any function, where `return` works
// ---------------------------------------------------------------------------

/** The guard narrows `data`; the function decides the exit. */
export async function imperative(): Promise<User | null> {
  const { data, error } = await $checkedFetch.try('/api/users/:id')

  if (error) {
    matchError(
      error,
      {
        forbidden: (e) => snack(`You need ${e.requiredRole}`),
        userNotFound: (e) => notFound(e.userId),
        userSuspended: (e) => blocked(e.until),
      },
      (err, unrecognized) => {
        if (unrecognized) return report(`unknown failure: ${unrecognized.tag}`)
        showError(err)
      }
    )
    return null
  }

  // Narrowed by the sibling guard alone - no second check and no `!`.
  const user: User = data
  type _successIsTheRoutes = Expect<Equal<typeof data, User>>

  return user
}

/** There is no `ok`: `error`'s presence is the whole discriminant. */
export async function noOkDiscriminant(): Promise<void> {
  const result = await $checkedFetch.try('/api/users/:id')

  // @ts-expect-error - the try-shape carries `data` and `error`, nothing else
  void result.ok
}

/** The narrowing comes from the guard; `matchError` returns nothing. */
export async function matchErrorDoesNotNarrow(): Promise<void> {
  const { data, error } = await $checkedFetch.try('/api/users/:id')

  matchError(
    error,
    {
      forbidden: (e) => snack(e.requiredRole),
      userNotFound: (e) => notFound(e.userId),
      userSuspended: (e) => blocked(e.until),
    },
    (err) => showError(err)
  )

  // @ts-expect-error - still `User | undefined` without `if (error)`
  const user: User = data
  render(user)
}

/** `.try` carries the same union the composable's error ref does. */
export async function armParametersAreTheVariants(): Promise<void> {
  const { error } = await $checkedFetch.try('/api/users/:id')
  if (!error) return

  matchError(
    error,
    {
      forbidden: (e) => {
        const role: 'admin' | 'owner' = e.requiredRole
        // @ts-expect-error - `userId` belongs to a different variant
        snack(e.userId)
        snack(`You need ${role}`)
      },
      userNotFound: (e) => notFound(e.userId),
      userSuspended: (e) => blocked(e.until),
    },
    (err) => showError(err)
  )
}

/** A route that declares nothing degrades on `.try` as everywhere else. */
export async function undeclaredRoute(): Promise<{ fine: boolean } | null> {
  const { data, error } = await $checkedFetch.try('/api/boom')

  if (error) {
    matchError(error, {}, (err, unrecognized) => {
      if (unrecognized) return report(unrecognized.tag)
      showError(err)
    })
    return null
  }

  return data
}

/** `.create` keeps the checked interface, so `.try` survives one level down. */
export async function createKeepsTheSibling(): Promise<{ ok: true } | null> {
  const api = $checkedFetch.create({ baseURL: '/v2' })
  const { data, error } = await api.try('/api/chain/c')

  if (error) {
    matchError(error, { cGone: (e) => report(`gone: ${e.resource}`) }, (err) =>
      showError(err)
    )
    return null
  }

  return data
}

/** `.raw` has no `.try`, deliberately - it already returns without throwing. */
export async function rawHasNoTry(): Promise<number> {
  const res = await $checkedFetch.raw('/api/users/:id')

  // @ts-expect-error - `.raw` already returns a response, not a throw
  await $checkedFetch.raw.try('/api/users/:id')

  return res.status
}

/** `.native` is the bare fetch, passed through untouched. */
export async function nativePassesThrough(): Promise<number> {
  const res: Response = await $checkedFetch.native('/api/users/:id')

  // @ts-expect-error - no `.try` on the bare fetch either
  await $checkedFetch.native.try('/api/users/:id')

  return res.status
}

/** The throwing form is vanilla's: the union does not survive a `throw`. */
export async function throwingPathReadsTheFloor(): Promise<void> {
  try {
    render(await $checkedFetch('/api/users/:id'))
  } catch (e) {
    // @ts-expect-error - degraded only; both overloads fail on an `unknown`
    matchError(e, { forbidden: () => snack('nope') }, (err) => showError(err))

    matchError(e, {}, (err, unrecognized) => {
      if (unrecognized) return report(unrecognized.tag)
      showError(err)
    })
  }
}

// ---------------------------------------------------------------------------
// The server surface - the seam exactly
// ---------------------------------------------------------------------------

/**
 * The imperative shape with `throw` as the exit; the trailing generic throw is
 * required because the compiler cannot know an arm throws.
 */
export const serverHandler = defineEventHandler(async (event) => {
  const { data, error } = await event.$checkedFetch.try('/api/chain/c')

  if (error) {
    matchError(
      error,
      {
        cGone: (e) => {
          const resource: string = e.resource
          report(`upstream resource gone: ${resource}`)
        },
      },
      (err) => report(`upstream failure: ${err.status ?? 0}`)
    )
    throw new Error('upstream failed')
  }

  const ok: true = data.ok
  return { ok }
})

/** The members Nitro types on `event.$fetch` but never assigns do not exist
 * here to be reached for. */
export const eventSurfaceIsTheSeam = defineEventHandler(async (event) => {
  // @ts-expect-error - no `.raw` on the event-bound instance
  await event.$checkedFetch.raw('/api/users/:id')
  // @ts-expect-error - no `.create` either
  event.$checkedFetch.create({ baseURL: '/v2' })
  // @ts-expect-error - nor `.native`
  await event.$checkedFetch.native('/api/users/:id')

  render(await event.$checkedFetch('/api/users/:id'))
})

// ---------------------------------------------------------------------------
// One seam, three instances
// ---------------------------------------------------------------------------

/** A `shared/` util that names the seam as a parameter; the caller chooses
 * the request context. */
async function sharedGetUser(fetcher: CheckedFetch): Promise<User | null> {
  const { data, error } = await fetcher.try('/api/users/:id')

  if (error) {
    matchError(
      error,
      {
        forbidden: (e) => snack(`You need ${e.requiredRole}`),
        userNotFound: (e) => notFound(e.userId),
        userSuspended: (e) => blocked(e.until),
      },
      (err) => showError(err)
    )
    return null
  }

  return data
}

/** …fed the context-forwarding instance on the server… */
export const sharedFromServer = defineEventHandler((event) =>
  sharedGetUser(event.$checkedFetch)
)

/** …and the global everywhere else - `$CheckedFetch extends CheckedFetch`. */
export function sharedFromApp(): Promise<User | null> {
  return sharedGetUser($checkedFetch)
}

// ---------------------------------------------------------------------------
// The composable surface - `<script setup>` top level, where `return` is a
// compile error
// ---------------------------------------------------------------------------

// Declared rather than imported: these live behind `#app`, which does not
// resolve under a plain `vitest run`. `typeof import(…)` is a type query - it
// asserts the real declaration and emits no import.
declare const useCheckedFetch: typeof import('../../src/runtime/app/composables/use-checked-fetch').useCheckedFetch
declare const useLazyCheckedFetch: typeof import('../../src/runtime/app/composables/use-checked-fetch').useLazyCheckedFetch
declare const useRequestCheckedFetch: typeof import('../../src/runtime/app/composables/use-request-checked-fetch').useRequestCheckedFetch

/** One call, no guard, no nesting, no reader. */
export async function composable(): Promise<void> {
  const { data: _data, error } = await useCheckedFetch('/api/users/:id')

  // `data` is vanilla's own ref, `| undefined` and all.
  type _dataIsVanillas = Expect<Equal<typeof _data.value, User | undefined>>

  matchError(
    error,
    {
      forbidden: (e) => snack(`You need ${e.requiredRole}`),
      userNotFound: (e) => notFound(e.userId),
      userSuspended: (e) => blocked(e.until),
    },
    (err, unrecognized) => {
      if (unrecognized) return report(`unknown failure: ${unrecognized.tag}`)
      showError(err)
    }
  )
}

/** A route declaring nothing is typed exactly as vanilla - the degradation lock. */
export async function composableUndeclaredRoute(): Promise<void> {
  const { error } = await useCheckedFetch('/api/boom')

  // @ts-expect-error - nothing was declared, so there is no arm to name
  matchError(error, { cGone: () => report('gone') }, (err) => showError(err))

  matchError(error, {}, (err) => showError(err))
}

/** The lazy twin carries the same union; only `lazy` is pre-set. */
export async function composableLazyTwin(): Promise<void> {
  const { error } = await useLazyCheckedFetch('/api/chain/c')

  matchError(error, { cGone: (e) => report(e.resource) }, (err) =>
    showError(err)
  )
}

/** SSR-safe imperative calls in app code: on the server vanilla hands back
 * the bare event closure, so the request-bound instance is the seam exactly. */
export async function requestBoundImperative(): Promise<User | null> {
  const fetcher = useRequestCheckedFetch()

  // @ts-expect-error - no `.raw` on the request-bound instance
  await fetcher.raw('/api/users/:id')

  return sharedGetUser(fetcher)
}

it('is asserted by the compiler', () => {})
