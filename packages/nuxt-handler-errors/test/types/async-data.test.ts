import { it } from 'vitest'
import { watch } from 'vue'
import { matchError } from '../../src/runtime/shared'
import type { CheckedFetch } from '../../src/runtime/types'
import type { User } from './routes'

/**
 * The asyncData surface's compile-time contract — the agreed call styles over a
 * hand-written stand-in for the generated map. Every assertion here is made by
 * the compiler under `pnpm typecheck`: an `Expect<Equal<…>>` that stops holding
 * is a type error, and a `@ts-expect-error` that stops being needed is TS2578.
 *
 * The point of the whole file is that **nothing is annotated**: the declared
 * union rides the repository function's inferred return type, all the way to
 * the matcher's arms.
 */

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false

type Expect<T extends true> = T

declare function snack(message: string): void
declare function report(message: string): void
declare function showError(error: unknown): void
declare function notFound(id: string): void
declare function blocked(until: string): void

/**
 * Declared rather than imported, for one reason: these two live behind `#app`,
 * which resolves under `vue-tsc` and not under a plain `vitest run`, and this
 * file's runtime half must still load. `typeof import(…)` is a type query — it
 * asserts the real declaration and emits no import.
 */
declare const useCheckedAsyncData: typeof import('../../src/runtime/app/composables/use-checked-async-data').useCheckedAsyncData
declare const useLazyCheckedAsyncData: typeof import('../../src/runtime/app/composables/use-checked-async-data').useLazyCheckedAsyncData

// ---------------------------------------------------------------------------
// The repositories the union rides out of
// ---------------------------------------------------------------------------

// Components rarely spell routes; they call a repository that wraps `.try`.
const userRepo = {
  get: (_id: string) => $checkedFetch.try('/api/users/:id'),
}

/** A repository over the seam, for `shared/` — same inference, caller picks
 * the context by choosing the instance. */
function createChainRepo(fetcher: CheckedFetch) {
  return {
    c: () => fetcher.try('/api/chain/c'),
  }
}

/** A method touching two routes: early-return each failure, hand-build the
 * success. The return type becomes the union of both error arms plus the
 * success — inferred, never written. */
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

/** The shape, whole: one key, one repository call, zero annotations — and the
 * matcher gets the route's full union. */
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

/** Keyless, exactly as vanilla — the module registers the name in
 * `optimization.keyedComposables`, so the compiler injects the key. */
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

/** The lazy twin is the same surface with `lazy` pre-set, and the reactive
 * composition is exactly what a lazy fetch needs — the error arrives after
 * setup, `immediate` covers it. */
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
    // @ts-expect-error — `user-suspended` has no arm
    {
      forbidden: (e) => snack(e.requiredRole),
      'user-not-found': (e) => notFound(e.userId),
    },
    (err) => showError(err)
  )
}

/** Two routes through one handler: the carrier union arrives whole, the arms
 * are exhaustive over BOTH routes' tags, and each payload narrows. This is
 * what the carrier-generic matcher buys. */
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

/** Dropping the second route's only tag is a compile error — cross-route
 * exhaustiveness, not just per-route. */
export async function multiRouteExhaustiveness(): Promise<void> {
  const { error } = await useCheckedAsyncData('user-and-c', () =>
    getUserWithChain()
  )

  matchError(
    error,
    // @ts-expect-error — `c-gone` has no arm
    {
      forbidden: (e) => snack(e.requiredRole),
      'user-not-found': (e) => notFound(e.userId),
      'user-suspended': (e) => blocked(e.until),
    },
    (err) => showError(err)
  )
}

/** Vanilla's options work on the UNWRAPPED data: `transform` sees plain
 * success, `default` replaces `undefined`, exactly as vanilla types them. */
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

/** `status` and `refresh` are vanilla's own — underneath it IS vanilla. */
export async function vanillaMembersSurvive(): Promise<void> {
  const { status, refresh } = await useCheckedAsyncData('user', () =>
    userRepo.get('42')
  )

  const s: 'idle' | 'pending' | 'success' | 'error' = status.value
  report(s)

  await refresh()
}

/** A route that declares nothing degrades through the wrapper exactly as it
 * degrades everywhere else. */
export async function degradedRouteThroughTheWrapper(): Promise<void> {
  const { error } = await useCheckedAsyncData('boom', () =>
    $checkedFetch.try('/api/boom')
  )

  // @ts-expect-error — nothing was declared, so there is no arm to name
  matchError(error, { 'c-gone': () => report('gone') }, (err) => showError(err))

  matchError(error, {}, (err, unrecognized) => {
    if (unrecognized) return report(unrecognized.tag)
    showError(err)
  })
}

/** Forgetting `.try` is a compile error, not a silent degradation: a bare
 * `$checkedFetch` resolves to plain data, which is not a try-shape. The wrapper
 * turns the discipline into a constraint. */
export async function forgettingTryCannotCompile(): Promise<void> {
  // @ts-expect-error — the handler must return a try-shape, not raw data
  await useCheckedAsyncData('user', () => $checkedFetch('/api/users/:id'))
}

it('is asserted by the compiler', () => {})
