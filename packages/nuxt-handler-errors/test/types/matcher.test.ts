import type { NuxtError } from 'nuxt/app'
import { describe, expect, it } from 'vitest'
import type { Ref } from 'vue'
import { watch } from 'vue'
import { matchError } from '../../src/runtime/shared'
import type { KnownErrorBody } from '../../src/runtime/shared/wire'
import type { KnownVariant } from '../../src/runtime/types'
import type { VariantOf } from '../../src/runtime/types/matcher'

/**
 * The matcher's compile-time contract, asserted by the compiler under
 * `pnpm typecheck`. Narrowing is asserted with explicitly-typed consts rather
 * than by using the arm parameters: property access on `never` compiles, so a
 * call site can keep passing while narrowing is gone.
 */

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false

type Expect<T extends true> = T

// ---------------------------------------------------------------------------
// Two routes' carriers, as the composable and `.try` surfaces will hand them over
// ---------------------------------------------------------------------------

type UserVariants =
  | { tag: 'forbidden'; status: 403; requiredRole: 'admin' | 'owner' }
  | { tag: 'userNotFound'; status: 404; userId: string }
  | { tag: 'userSuspended'; status: 403; until: string }

interface ChainVariants {
  tag: 'cGone'
  status: 410
  resource: string
}

type UserCarrier = NuxtError<KnownErrorBody<UserVariants>>
type ChainCarrier = NuxtError<KnownErrorBody<ChainVariants>>

declare const userError: Ref<UserCarrier | undefined>
declare const chainError: ChainCarrier | undefined
/** What a repository method touching both routes hands the matcher. */
declare const unionError: Ref<UserCarrier | ChainCarrier | undefined>
/** A route declaring nothing, or vanilla `useFetch` - no union was carried. */
declare const vanillaError: Ref<NuxtError | undefined>

declare function snack(message: string): void
declare function report(message: string): void
declare function showError(error: unknown): void
declare function notFound(id: string): void
declare function blocked(until: string): void
declare function navigateTo(to: string): Promise<void>

// ---------------------------------------------------------------------------
// The extraction
// ---------------------------------------------------------------------------

/** Naked and distributing: a union of carriers yields every route's variants. */
export type AssertVariantOfDistributes = Expect<
  Equal<VariantOf<UserCarrier | ChainCarrier>, UserVariants | ChainVariants>
>

/** A carrier with no marker declares nothing. */
export type AssertVanillaCarrierHasNoVariants = Expect<
  Equal<VariantOf<NuxtError>, never>
>

/** Plain `void`, never `void | undefined` - TS1345 does not fire on the union. */
export type AssertReturnsVoid = Expect<
  Equal<ReturnType<typeof matchError>, void>
>

// ---------------------------------------------------------------------------
// The typed call
// ---------------------------------------------------------------------------

/** One call, no guard, no nesting, no reader. */
export function typedCall(): void {
  matchError(
    userError,
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

/** Arm parameters are the real variant - not `never`, not `any`. */
export function armParameters(): void {
  matchError(
    userError,
    {
      forbidden: (e) => {
        const tag: 'forbidden' = e.tag
        const status: 403 = e.status
        const role: 'admin' | 'owner' = e.requiredRole
        // @ts-expect-error - `userId` belongs to a different variant
        snack(e.userId)
        snack(`${tag} ${status}: you need ${role}`)
      },
      userNotFound: (e) => {
        const userId: string = e.userId
        const status: 404 = e.status
        report(`${status}: no user ${userId}`)
      },
      userSuspended: (e) => blocked(e.until),
    },
    (err, unrecognized) => {
      const status: number | undefined = err.status
      const skew: KnownVariant | undefined = unrecognized
      report(`${status ?? 0}: ${skew?.tag ?? 'no marker'}`)
    }
  )
}

/** Missing an arm is a compile error - that is what makes the fallback mean
 * one thing. The diagnostic anchors on the arms argument. */
export function exhaustiveness(): void {
  matchError(
    userError,
    // @ts-expect-error - `userSuspended` has no arm
    {
      forbidden: (e) => snack(e.requiredRole),
      userNotFound: (e) => notFound(e.userId),
    },
    (err) => showError(err)
  )
}

/** Cross-route exhaustiveness: the carrier union arrives whole, so the second
 * route's only tag is required too. */
export function unionOfCarriers(): void {
  matchError(
    unionError,
    {
      forbidden: (e) => snack(e.requiredRole),
      userNotFound: (e) => notFound(e.userId),
      userSuspended: (e) => blocked(e.until),
      cGone: (e) => {
        const resource: string = e.resource
        report(`gone: ${resource}`)
      },
    },
    (err) => showError(err)
  )
}

export function unionOfCarriersExhaustiveness(): void {
  matchError(
    unionError,
    // @ts-expect-error - `cGone` has no arm
    {
      forbidden: (e) => snack(e.requiredRole),
      userNotFound: (e) => notFound(e.userId),
      userSuspended: (e) => blocked(e.until),
    },
    (err) => showError(err)
  )
}

/** Arms handle; they do not produce. `void` absorbs whatever they return, so
 * they may disagree freely. */
export function armsMayDisagree(): void {
  matchError(
    userError,
    {
      forbidden: () => navigateTo('/login'),
      userNotFound: (e) => notFound(e.userId),
      userSuspended: (e) => blocked(e.until),
    },
    () => navigateTo('/error')
  )
}

/** Passing the value rather than the ref works identically. */
export function plainValue(): void {
  matchError(chainError, { cGone: (e) => report(e.resource) }, (err) =>
    showError(err)
  )
}

/** The reactive form is composition: the matcher reads the ref at call time,
 * so a watcher re-calling it is correct on every refetch. */
export function reactiveComposition(): void {
  watch(
    userError,
    () =>
      matchError(
        userError,
        {
          forbidden: (e) => snack(`You need ${e.requiredRole}`),
          userNotFound: (e) => notFound(e.userId),
          userSuspended: (e) => blocked(e.until),
        },
        (err) => showError(err)
      ),
    { immediate: true }
  )
}

/** The fallback is required; omitting it could only ever silence the 500. */
export function fallbackIsRequired(): void {
  // @ts-expect-error - two arguments is no longer a call
  matchError(userError, {
    forbidden: (e: KnownVariant) => snack(e.tag),
    userNotFound: (e: KnownVariant) => snack(e.tag),
    userSuspended: (e: KnownVariant) => snack(e.tag),
  })
}

// ---------------------------------------------------------------------------
// The degraded call
// ---------------------------------------------------------------------------

/** No typed arms at all; every marked variant reaches the fallback as
 * `unrecognized`. */
export function degraded(): void {
  matchError(vanillaError, {}, (err, unrecognized) => {
    if (unrecognized) return report(unrecognized.tag)
    showError(err)
  })
}

/** A `catch` variable is `unknown`; the floor is all that survives a throw. */
export function degradedCatch(): void {
  try {
    report('work')
  } catch (e) {
    matchError(e, {}, (err, unrecognized) => {
      if (unrecognized) return report(`unknown failure: ${unrecognized.tag}`)
      showError(err)
    })
  }
}

/** Typed arms cannot ride along on an `unknown`: both overloads fail, so the
 * diagnostic is a whole-call TS2769. */
export function degradedCannotMatchTags(): void {
  try {
    report('work')
  } catch (e) {
    // @ts-expect-error - degraded only; restating the route here was rejected
    matchError(e, { forbidden: () => snack('nope') }, (err) => showError(err))
  }
}

/** The degraded overload must not swallow a typed call that is missing an arm:
 * `Record<string, never>` admits `{}` and nothing else. */
export function degradedArmsAdmitNothingElse(): void {
  // @ts-expect-error - an arm is not `never`
  matchError(vanillaError, { forbidden: () => snack('nope') }, (err) =>
    showError(err)
  )
}

// ---------------------------------------------------------------------------
// The `void` return, in the three positions it is load-bearing
// ---------------------------------------------------------------------------

/** The matcher is a statement, so it cannot be tested for truthiness. */
export function isNotAnExpression(): void {
  // @ts-expect-error - TS1345: an expression of type 'void' cannot be tested
  if (matchError(vanillaError, {}, showError)) report('unreachable')
}

/** Handling has no result: a value-returning function must still decide its
 * own exit. */
export function cannotReturnTheMatch(): string | null {
  // @ts-expect-error - `void` is not the function's return type
  return matchError(vanillaError, {}, (err) => showError(err))
}

/** Keeps the file in vitest's inventory. */
describe('the matcher surface', () => {
  it('is asserted by the compiler', () => {
    expect(matchError).toBeTypeOf('function')
  })
})
