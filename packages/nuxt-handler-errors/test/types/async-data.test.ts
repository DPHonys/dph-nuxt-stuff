import type { NuxtError } from 'nuxt/app'
import { it } from 'vitest'
import { watch } from 'vue'
import { matchError } from '../../src/runtime/shared'
import type { CheckedFetch } from '../../src/runtime/types'
import type { User } from './routes'

/**
 * The asyncData surface's compile-time contract, asserted by the compiler
 * under `pnpm typecheck`. Nothing is annotated on purpose: the declared union
 * rides the repository function's inferred return type all the way to the
 * matcher's arms.
 */

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false

type Expect<T extends true> = T

declare function snack(message: string): void
declare function report(message: string): void
declare function showError(error: NuxtError): void
declare function notFound(id: string): void
declare function blocked(until: string): void

// Declared rather than imported: these live behind `#app`, which does not
// resolve under a plain `vitest run`. `typeof import(…)` is a type query - it
// asserts the real declaration and emits no import.
declare const useCheckedAsyncData: typeof import('../../src/runtime/app/composables/use-checked-async-data').useCheckedAsyncData
declare const useLazyCheckedAsyncData: typeof import('../../src/runtime/app/composables/use-checked-async-data').useLazyCheckedAsyncData

// ---------------------------------------------------------------------------
// The repositories the union rides out of
// ---------------------------------------------------------------------------

// Components rarely spell routes; they call a repository that wraps `.try`.
const userRepo = {
  get: (_id: string) => $checkedFetch.try('/api/users/:id'),
}

/** A repository over the seam, for `shared/`. */
function createChainRepo(fetcher: CheckedFetch) {
  return {
    c: () => fetcher.try('/api/chain/c'),
  }
}

/** Two routes through one method: the return type is the union of both error
 * arms plus the success - inferred, never written. */
async function getUserWithChain() {
  const user = await userRepo.get('42')
  if (user.error) return user

  const c = await createChainRepo($checkedFetch).c()
  if (c.error) return c

  return { data: { user: user.data, c: c.data }, error: undefined }
}

// ---------------------------------------------------------------------------
// The call styles
// ---------------------------------------------------------------------------

/** One key, one repository call, zero annotations - and the matcher gets the
 * route's full union. */
export async function throughARepository(): Promise<void> {
  const { data: _data, error } = await useCheckedAsyncData('user', () =>
    userRepo.get('42')
  )

  type _dataIsUnwrapped = Expect<Equal<typeof _data.value, User | undefined>>

  matchError(
    error,
    {
      forbidden: (e) => {
        const role: 'admin' | 'owner' = e.requiredRole
        snack(`You need ${role}`)
      },
      'user-not-found': (e) => notFound(e.userId),
      'user-suspended': (e) => blocked(e.until),
    },
    (err, unrecognized) => {
      if (unrecognized) return report(`unknown failure: ${unrecognized.tag}`)
      showError(err)
    }
  )
}

/** Keyless, exactly as vanilla - `optimization.keyedComposables` injects the
 * key at compile time. */
export async function keylessForm(): Promise<void> {
  const { error } = await useCheckedAsyncData(() => userRepo.get('42'))

  matchError(
    error,
    {
      forbidden: (e) => snack(e.requiredRole),
      'user-not-found': (e) => notFound(e.userId),
      'user-suspended': (e) => blocked(e.until),
    },
    (err) => showError(err)
  )
}

/** The lazy twin: the error arrives after setup, so the reactive composition
 * with `immediate` covers it. */
export async function lazyTwin(): Promise<void> {
  const { error } = await useLazyCheckedAsyncData('user', () =>
    userRepo.get('42')
  )

  watch(
    error,
    () =>
      matchError(
        error,
        {
          forbidden: (e) => snack(`You need ${e.requiredRole}`),
          'user-not-found': (e) => notFound(e.userId),
          'user-suspended': (e) => blocked(e.until),
        },
        (err) => showError(err)
      ),
    { immediate: true }
  )
}

/** Exhaustiveness survives the wrapper. */
export async function wrapperKeepsExhaustiveness(): Promise<void> {
  const { error } = await useCheckedAsyncData('user', () => userRepo.get('42'))

  matchError(
    error,
    // @ts-expect-error - `user-suspended` has no arm
    {
      forbidden: (e) => snack(e.requiredRole),
      'user-not-found': (e) => notFound(e.userId),
    },
    (err) => showError(err)
  )
}

/** The carrier union arrives whole, the arms are exhaustive over both routes'
 * tags, and each payload narrows. */
export async function multiRouteRepository(): Promise<void> {
  const { data: _data, error } = await useCheckedAsyncData('user-and-c', () =>
    getUserWithChain()
  )

  type _dataIsTheHandBuiltSuccess = Expect<
    Equal<typeof _data.value, { user: User; c: { ok: true } } | undefined>
  >

  matchError(
    error,
    {
      forbidden: (e) => snack(e.requiredRole),
      'user-not-found': (e) => notFound(e.userId),
      'user-suspended': (e) => blocked(e.until),
      'c-gone': (e) => {
        const resource: string = e.resource
        report(`gone: ${resource}`)
      },
    },
    (err) => showError(err)
  )
}

/** Cross-route exhaustiveness, not just per-route. */
export async function multiRouteExhaustiveness(): Promise<void> {
  const { error } = await useCheckedAsyncData('user-and-c', () =>
    getUserWithChain()
  )

  matchError(
    error,
    // @ts-expect-error - `c-gone` has no arm
    {
      forbidden: (e) => snack(e.requiredRole),
      'user-not-found': (e) => notFound(e.userId),
      'user-suspended': (e) => blocked(e.until),
    },
    (err) => showError(err)
  )
}

/** Vanilla's options work on the unwrapped data, exactly as vanilla types
 * them. */
export async function vanillaOptionsSurvive(): Promise<void> {
  const { data: _data } = await useCheckedAsyncData(
    'user-name',
    () => userRepo.get('42'),
    {
      lazy: true,
      default: () => null,
      transform: (user) => ({ shout: user.name.toUpperCase() }),
    }
  )

  type _transformed = Expect<
    Equal<typeof _data.value, { shout: string } | null>
  >
}

/** `pick`, the other half of vanilla's data shaping. */
export async function vanillaPickSurvives(): Promise<void> {
  const { data: _data } = await useCheckedAsyncData(
    'user-id',
    () => userRepo.get('42'),
    { pick: ['id'] }
  )

  type _picked = Expect<Equal<typeof _data.value, { id: string } | undefined>>
}

/** `status` and `refresh` are vanilla's own - underneath it IS vanilla. */
export async function vanillaMembersSurvive(): Promise<void> {
  const { status, refresh } = await useCheckedAsyncData('user', () =>
    userRepo.get('42')
  )

  const s: 'idle' | 'pending' | 'success' | 'error' = status.value
  report(s)

  await refresh()
}

/** A route that declares nothing degrades through the wrapper as everywhere
 * else. */
export async function degradedRouteThroughTheWrapper(): Promise<void> {
  const { error } = await useCheckedAsyncData('boom', () =>
    $checkedFetch.try('/api/boom')
  )

  // @ts-expect-error - nothing was declared, so there is no arm to name
  matchError(error, { 'c-gone': () => report('gone') }, (err) => showError(err))

  matchError(error, {}, (err, unrecognized) => {
    if (unrecognized) return report(unrecognized.tag)
    showError(err)
  })
}

/** Forgetting `.try` is a compile error, not a silent degradation. */
export async function forgettingTryCannotCompile(): Promise<void> {
  // @ts-expect-error - the handler must return a try-shape, not raw data
  await useCheckedAsyncData('user', () => $checkedFetch('/api/users/:id'))
}

it('is asserted by the compiler', () => {})
