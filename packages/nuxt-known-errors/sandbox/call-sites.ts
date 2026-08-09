// The agreed call styles, in the two places they are written.
//
// Every `@ts-expect-error` here is load-bearing: an unused one is TS2578, so a
// regression is a build failure rather than a hover nobody checked. Narrowing
// is asserted with explicitly-typed consts for the same reason — the `NoInfer`
// bug in §6 collapsed arm parameters to `never`, and property access on `never`
// compiles, so every call site kept passing while narrowing was gone.

import type { NuxtError } from './fixtures'
import {
  createError,
  defineEventHandler,
  useAsyncData,
  watch,
} from './fixtures'
import type { KnownVariant, CheckedFetch } from './matcher'
import {
  $checkedFetch,
  matchError,
  useFetch,
  useLazyCheckedAsyncData,
  useLazyCheckedFetch,
  useRequestCheckedFetch,
  useCheckedAsyncData,
  useCheckedFetch,
} from './matcher'

interface User {
  id: string
  name: string
}

declare function snack(message: string): void
declare function report(message: string): void
declare function showError(error: unknown): void
declare function notFound(id: string): void
declare function blocked(until: string): void
declare function navigateTo(to: string): Promise<void>
declare function render(user: User): void

// ===========================================================================
// Composable — `<script setup>` top level, where `return` is a compile error
// ===========================================================================

// The shape, whole. One call, no guard, no nesting, no reader. `data` goes to
// the template, which the sandbox cannot model, so only `error` is read here.
export async function composable(): Promise<void> {
  const { error } = await useCheckedFetch('/api/users/:id')

  matchError(
    error,
    {
      forbidden: (e) => snack(`You need ${e.requiredRole}`),
      'user-not-found': (e) => notFound(e.userId),
      'user-suspended': (e) => blocked(e.until),
    },
    (err, unrecognized) => {
      if (unrecognized) return report(`unknown failure: ${unrecognized.tag}`)
      showError(err)
    }
  )
}

/** Missing an arm is a compile error — that is what makes the fallback mean one thing. */
export async function composableExhaustiveness(): Promise<void> {
  const { error } = await useCheckedFetch('/api/users/:id')

  matchError(
    error,
    // @ts-expect-error — `user-suspended` has no arm. The diagnostic anchors on
    // the arms argument, so the directive belongs here rather than on the call.
    {
      forbidden: (e) => snack(e.requiredRole),
      'user-not-found': (e) => notFound(e.userId),
    },
    (err) => showError(err)
  )
}

// Arms handle; they do not produce. `void` absorbs whatever they return, so
// they may disagree freely — a navigating arm beside a plain one, and a
// navigating fallback, which under an inferred `R` broke every `void` arm.
export async function composableArmsMayDisagree(): Promise<void> {
  const { error } = await useCheckedFetch('/api/users/:id')

  matchError(
    error,
    {
      forbidden: () => navigateTo('/login'),
      'user-not-found': (e) => notFound(e.userId),
      'user-suspended': (e) => blocked(e.until),
    },
    () => navigateTo('/error')
  )
}

/**
 * The reactive form is composition, not a new function: the matcher reads the
 * ref at call time, so a watcher that re-calls it is correct on every refetch.
 * `immediate: true` also covers the non-awaited (lazy) fetch, where the error
 * arrives after setup. Side-effect arms re-fire per failed refetch — the
 * accepted, and usually wanted, difference from the one-shot style.
 */
export async function composableReactive(): Promise<void> {
  const { error } = await useCheckedFetch('/api/users/:id')

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

/** The matcher is a statement, so it cannot be tested for truthiness. */
export async function composableIsNotAnExpression(): Promise<void> {
  const { error } = await useCheckedFetch('/api/boom')

  // @ts-expect-error — TS1345: an expression of type 'void' cannot be tested
  if (matchError(error, {}, showError)) report('unreachable')
}

/** Arm parameters are the real variant, not `never` and not `any`. */
export async function composableArmParameters(): Promise<void> {
  const { error } = await useCheckedFetch('/api/users/:id')

  matchError(
    error,
    {
      forbidden: (e) => {
        const tag: 'forbidden' = e.tag
        const status: 403 = e.status
        const role: 'admin' | 'owner' = e.requiredRole
        // @ts-expect-error — `userId` belongs to a different variant
        snack(e.userId)
        snack(`${tag} ${status}: you need ${role}`)
      },
      'user-not-found': (e) => {
        const userId: string = e.userId
        const status: 404 = e.status
        report(`${status}: no user ${userId}`)
      },
      'user-suspended': (e) => blocked(e.until),
    },
    (err, unrecognized) => {
      const status: number | undefined = err.status
      const skew: KnownVariant | undefined = unrecognized
      report(`${status ?? 0}: ${skew?.tag ?? 'no marker'}`)
    }
  )
}

/** A route that declares nothing degrades to vanilla — still callable. */
export async function composableUndeclaredRoute(): Promise<void> {
  const { error } = await useCheckedFetch('/api/boom')

  matchError(error, {}, (err, unrecognized) => {
    if (unrecognized) return report(unrecognized.tag)
    showError(err)
  })
}

/** Vanilla `useFetch` — no union was carried, so the fallback does the work. */
export async function composableVanilla(): Promise<void> {
  const { error } = await useFetch('/api/users/:id')

  matchError(error, {}, (err, unrecognized) => {
    if (unrecognized) return report(unrecognized.tag)
    showError(err)
  })
}

/**
 * Passing the value rather than the ref works identically. Also the one-variant
 * route: a single arm, and the fallback still catches everything else.
 */
export async function composablePlainValue(): Promise<void> {
  const { error } = await useCheckedFetch('/api/chain/c')

  matchError(error.value, { 'c-gone': (e) => report(e.resource) }, (err) =>
    showError(err)
  )
}

/** The lazy twin carries the same union; the error arrives after setup, so
 * the reactive composition is the read that fits it. */
export async function composableLazyTwin(): Promise<void> {
  const { error } = await useLazyCheckedFetch('/api/users/:id')

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

// ===========================================================================
// Imperative — inside any function, where `return` works
// ===========================================================================

/** The shape, whole. The guard narrows `data`; the function decides the exit. */
export async function imperative(): Promise<void> {
  const { data, error } = await $checkedFetch.try('/api/users/:id')

  if (error) {
    matchError(
      error,
      {
        forbidden: (e) => snack(`You need ${e.requiredRole}`),
        'user-not-found': (e) => notFound(e.userId),
        'user-suspended': (e) => blocked(e.until),
      },
      (err, unrecognized) => {
        if (unrecognized) return report(`unknown failure: ${unrecognized.tag}`)
        showError(err)
      }
    )
    return
  }

  render(data)
}

// A util that returns data. The matcher handles the failure; the function
// decides what it returns, and the compiler keeps those two jobs apart.
export async function utilReturningData(): Promise<User | null> {
  const { data, error } = await $checkedFetch.try('/api/users/:id')

  if (error) {
    matchError(
      error,
      {
        forbidden: (e) => snack(`You need ${e.requiredRole}`),
        'user-not-found': (e) => notFound(e.userId),
        'user-suspended': (e) => blocked(e.until),
      },
      (err) => showError(err)
    )
    return null
  }

  return data
}

/** The narrowing comes from the guard; `matchError` returns nothing. */
export async function imperativeNeedsTheGuard(): Promise<User> {
  const { data, error } = await $checkedFetch.try('/api/users/:id')

  matchError(
    error,
    {
      forbidden: (e) => snack(e.requiredRole),
      'user-not-found': (e) => notFound(e.userId),
      'user-suspended': (e) => blocked(e.until),
    },
    (err) => showError(err)
  )

  // @ts-expect-error — still `User | undefined` without `if (error)`
  const user: User = data
  return user
}

declare function guardShapedMatcher(e: unknown): e is NuxtError

/** Why the matcher is not a guard: a predicate does not narrow the sibling. */
export async function guardWouldNotHaveNarrowed(): Promise<User> {
  const { data, error } = await $checkedFetch.try('/api/users/:id')
  if (guardShapedMatcher(error)) throw error

  // @ts-expect-error — a user-declared predicate narrows `error` and nothing else
  const user: User = data
  return user
}

/** `.try` carries the same union the composable's error ref does. */
export async function imperativeArmParameters(): Promise<void> {
  const { error } = await $checkedFetch.try('/api/users/:id')
  if (!error) return

  matchError(
    error,
    {
      forbidden: (e) => {
        const role: 'admin' | 'owner' = e.requiredRole
        // @ts-expect-error — `userId` belongs to a different variant
        snack(e.userId)
        snack(`You need ${role}`)
      },
      'user-not-found': (e) => notFound(e.userId),
      'user-suspended': (e) => blocked(e.until),
    },
    (err) => showError(err)
  )
}

/** The fallback is required; omitting it could only ever silence the 500. */
export async function fallbackIsRequired(): Promise<void> {
  const { error } = await $checkedFetch.try('/api/users/:id')

  // @ts-expect-error — two arguments is no longer a call
  matchError(error, {
    forbidden: (e: KnownVariant) => snack(e.tag),
    'user-not-found': (e: KnownVariant) => snack(e.tag),
    'user-suspended': (e: KnownVariant) => snack(e.tag),
  })
}

/** A route that declares nothing degrades on `.try` as everywhere else. */
export async function imperativeUndeclaredRoute(): Promise<{
  fine: boolean
} | null> {
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

/** `.create` keeps the typed interface, so `.try` survives one level down. */
export async function imperativeCreate(): Promise<{ ok: true } | null> {
  const api = $checkedFetch.create({ baseURL: '/v2' })
  const { data, error } = await api.try('/api/chain/c')

  if (error) {
    matchError(
      error,
      { 'c-gone': (e) => report(`gone: ${e.resource}`) },
      (err) => showError(err)
    )
    return null
  }

  return data
}

/** `.raw` has no `.try`, deliberately. */
export async function imperativeRawHasNoTry(): Promise<number> {
  const res = await $checkedFetch.raw('/api/users/:id')

  // @ts-expect-error — `.raw` already returns without throwing
  await $checkedFetch.raw.try('/api/users/:id')

  return res.status
}

/** `.native` is the bare fetch, passed through untouched — a `Response`, and
 * nothing on it to type. */
export async function imperativeNativePassesThrough(): Promise<number> {
  const res: Response = await $checkedFetch.native('/api/users/:id')

  // @ts-expect-error — no `.try` on the bare fetch either
  await $checkedFetch.native.try('/api/users/:id')

  return res.status
}

/** SSR-safe imperative calls in app code: the request-bound instance is the
 * seam exactly — on the server vanilla hands back the bare `event.$fetch`
 * closure, so anything more would be typed and absent. */
export async function requestBoundImperative(): Promise<User | null> {
  const fetcher = useRequestCheckedFetch()

  // @ts-expect-error — no `.raw` on the request-bound instance
  await fetcher.raw('/api/users/:id')

  const { data, error } = await fetcher.try('/api/users/:id')

  if (error) {
    matchError(
      error,
      {
        forbidden: (e) => snack(`You need ${e.requiredRole}`),
        'user-not-found': (e) => notFound(e.userId),
        'user-suspended': (e) => blocked(e.until),
      },
      (err) => showError(err)
    )
    return null
  }

  return data
}

// ===========================================================================
// The throwing path — vanilla, and honest about the floor
// ===========================================================================

/** `$checkedFetch` throws as `$fetch` does; the `catch` reads the floor. */
export async function throwingPath(): Promise<void> {
  try {
    render(await $checkedFetch('/api/users/:id'))
  } catch (e) {
    matchError(e, {}, (err, unrecognized) => {
      if (unrecognized) return report(`unknown failure: ${unrecognized.tag}`)
      showError(err)
    })
  }
}

/**
 * The floor is real: the union does not survive the throw. Here the error
 * argument is `unknown`, so both overloads fail and the diagnostic is a
 * whole-call TS2769 — the directive goes above the call, not above the arms.
 */
export async function catchCannotMatchTags(): Promise<void> {
  try {
    await $checkedFetch('/api/users/:id')
  } catch (e) {
    // @ts-expect-error — degraded only; restating the route here was rejected
    matchError(e, { forbidden: () => snack('nope') }, (err) => showError(err))
  }
}

// ===========================================================================
// Server — inside a Nitro handler, where a throw IS the response
// ===========================================================================

// The shape, whole: the client's imperative shape with `throw` as the exit.
// Arms translate — one that knows a specific answer throws the caller's own
// failure; the statement after the match block is the generic exit, the same
// division of labour as the client's `return null`. Nothing here lets the
// callee's error escape: the framework would scrub the variant and forward
// the callee's status line, answering with a status this route never meant.
export const serverHandler = defineEventHandler(async (event) => {
  const { data, error } = await event.$checkedFetch.try('/api/chain/c')

  if (error) {
    matchError(
      error,
      {
        'c-gone': (e) => {
          const resource: string = e.resource
          throw createError({
            statusCode: 410,
            message: `upstream resource gone: ${resource}`,
          })
        },
      },
      (err) => report(`upstream failure: ${err.status ?? 0}`)
    )
    throw createError({ statusCode: 502, message: 'upstream failed' })
  }

  const ok: true = data.ok
  return { ok }
})

/** The event surface is the seam exactly; the members Nitro types but never
 * assigns on `event.$fetch` do not exist here to be reached for. */
export const serverEventSurfaceIsTheSeam = defineEventHandler(async (event) => {
  // @ts-expect-error — no `.raw` on the event-bound instance
  await event.$checkedFetch.raw('/api/users/:id')
  // @ts-expect-error — no `.create` either
  event.$checkedFetch.create({ baseURL: '/v2' })

  render(await event.$checkedFetch('/api/users/:id'))
})

// ===========================================================================
// Shared — one seam, two instances
// ===========================================================================

// A `shared/` util that lets its caller choose the request context names the
// seam as a parameter. The arms are the same arms as everywhere else.
async function sharedGetUser(fetcher: CheckedFetch): Promise<User | null> {
  const { data, error } = await fetcher.try('/api/users/:id')

  if (error) {
    matchError(
      error,
      {
        forbidden: (e) => snack(`You need ${e.requiredRole}`),
        'user-not-found': (e) => notFound(e.userId),
        'user-suspended': (e) => blocked(e.until),
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

/** …and the global everywhere else — `$CheckedFetch extends CheckedFetch`. */
export function sharedFromApp(): Promise<User | null> {
  return sharedGetUser($checkedFetch)
}

// ===========================================================================
// `useCheckedAsyncData` — the union rides the handler's return type
// ===========================================================================

// Components rarely spell routes; they call a repository that wraps `.try`.
// The union rides the repository function's return type — nothing anywhere is
// annotated. (Fixture routes carry no params, so `id` goes unused; the real
// package forwards fetch options.)
const userRepo = {
  get: (_id: string) => $checkedFetch.try('/api/users/:id'),
}

/** A repository over the seam, for `shared/` — same inference, caller picks
 * the context by choosing the instance. */
// eslint-disable-next-line ts/explicit-function-return-type -- the inferred type IS the demonstration
export function createChainRepo(fetcher: CheckedFetch) {
  return {
    c: () => fetcher.try('/api/chain/c'),
  }
}

/** A repository method that touches two routes: early-return each failure,
 * hand-build the success. The return type becomes the union of both error
 * arms plus the success — inferred, never written. */
// eslint-disable-next-line ts/explicit-function-return-type -- the inferred type IS the demonstration
async function getUserWithChain() {
  const user = await userRepo.get('42')
  if (user.error) return user

  const c = await createChainRepo($checkedFetch).c()
  if (c.error) return c

  return { data: { user: user.data, c: c.data }, error: undefined }
}

/** The shape, whole: one key, one repository call, zero annotations — and the
 * matcher gets the route's full union. */
export async function throughARepository(): Promise<void> {
  const { data, error } = await useCheckedAsyncData('user', () =>
    userRepo.get('42')
  )

  const user: User | undefined = data.value
  report(user?.name ?? '')

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
  const { data, error } = await useCheckedAsyncData('user-and-c', () =>
    getUserWithChain()
  )

  const combined: { user: User; c: { ok: true } } | undefined = data.value
  report(combined?.user.id ?? '')

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
  const { data } = await useCheckedAsyncData(
    'user-name',
    () => userRepo.get('42'),
    {
      lazy: true,
      default: () => null,
      transform: (user) => ({ shout: user.name.toUpperCase() }),
    }
  )

  const value: { shout: string } | null = data.value
  report(value?.shout ?? '')
}

/** `pick`, the other half of vanilla's data shaping. */
export async function vanillaPickSurvives(): Promise<void> {
  const { data } = await useCheckedAsyncData(
    'user-id',
    () => userRepo.get('42'),
    { pick: ['id'] }
  )

  const value: { id: string } | undefined = data.value
  report(value?.id ?? '')
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

// ===========================================================================
// Vanilla `useAsyncData` with a throwing handler — degraded honestly
// ===========================================================================

/**
 * A handler's rejection carries no type, so the union cannot ride it and the
 * matcher degrades. Nothing is lost at runtime: the framework's own
 * `createError` copy carries the marker into the error ref, where the
 * degraded matcher hands it to the fallback as `unrecognized`.
 */
export async function asyncDataCustomHandler(): Promise<void> {
  const { error } = await useAsyncData('user-and-c', async () => {
    const [user, c] = await Promise.all([
      $checkedFetch('/api/users/:id'),
      $checkedFetch('/api/chain/c'),
    ])
    return { user, c }
  })

  matchError(error, {}, (err, unrecognized) => {
    if (unrecognized)
      return report(
        `known to the server, not to this call: ${unrecognized.tag}`
      )
    showError(err)
  })
}

/** Typed arms cannot ride along — the same whole-call TS2769 as a bare `catch`. */
export async function asyncDataCannotMatchTags(): Promise<void> {
  const { error } = await useAsyncData('user', () =>
    $checkedFetch('/api/users/:id')
  )

  // @ts-expect-error — degraded only; a wrapper restating the route was rejected
  matchError(error, { forbidden: () => snack('nope') }, (err) => showError(err))
}
