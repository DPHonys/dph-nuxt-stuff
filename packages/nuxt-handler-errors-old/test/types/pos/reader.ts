/**
 * The reader pair at layer 1: `declaredError` and
 * `useDeclaredError` over a hermetic replica of the framework's error types,
 * with nothing running.
 *
 * Every claim made about the read path is made here, plus the two
 * fixes in place (the union stays closed) and the shape floor
 * on the degraded overload. The runtime half — that a malformed marker reads as
 * undeclared — is `test/unit/reader.test.ts`; the real framework types are met at
 * layer 3, in `playground/shared/reader-probe.ts`.
 *
 * Must compile with **zero** diagnostics. The one
 * directive below is deliberate and is consumed; an unused one is `TS2578` and
 * would take this file red, which is what makes it an assertion.
 */

import type { ComputedRef, Ref, ShallowRef } from 'vue'
import { useDeclaredError } from '../../../src/runtime/app/composables/use-declared-error'
import { declaredError } from '../../../src/runtime/shared'
import type { AnyVariant, DeclaredErrorBody } from '../../../src/runtime/types'
import type { NuxtError } from '../replica'
import type { Equal, Expect, IsAny } from '../vocabulary'

/**
 * What `/api/users/:id` declares — three variants, each with a different
 * payload, so "narrows with payloads intact in **every** branch" is a claim
 * about three branches rather than about one.
 */
type UserFailure =
  | { tag: 'user-not-found'; status: 404; userId: string }
  | { tag: 'user-suspended'; status: 403; until: string }
  | { tag: 'forbidden'; status: 403; requiredRole: 'admin' | 'owner' }

/**
 * The error a caller holds for a declared route, spelled exactly as a client
 * ref holds it: **two generic levels**, `NuxtError<DeclaredErrorBody<…>>`. That
 * is the shape the union has to infer back out of, and the
 * one every client surface in tickets 10–12 will hand the reader.
 *
 * The union is written out again rather than referring to `UserFailure`, and
 * that is load-bearing for the *rendering* assertion rather than an oversight.
 * `TypeFormatFlags.InTypeAlias` suppresses the alias name for the top-level
 * type only, so a union that arrives here through an alias renders as
 * `UserFailure | undefined` — six characters, in budget, and measuring nothing.
 * What a consumer really holds is anonymous: the generated map indexes
 * `Simplify<Serialize<…>>` and hands the reader a bare union. This is that.
 * `_readsBackTheDeclaredUnion` below is what keeps the two spellings in step.
 */
declare const declaredFailure: NuxtError<
  DeclaredErrorBody<
    | { tag: 'user-not-found'; status: 404; userId: string }
    | { tag: 'user-suspended'; status: 403; until: string }
    | { tag: 'forbidden'; status: 403; requiredRole: 'admin' | 'owner' }
  >
>

/** An undeclared route's error — vanilla's channel, untouched. */
declare const vanillaFailure: NuxtError<unknown>

// ---------------------------------------------------------------------------
// The value form
// ---------------------------------------------------------------------------

/**
 * The hover budget's target, and the type a caller reads before writing a
 * `switch`: *"the flat variant
 * union"*, and the reason the envelope-shaped `error.value` hover is
 * acceptable.
 */
const _readerReturn = declaredError(declaredFailure)

/**
 * **The union comes back out through both generic levels, and it comes back
 * closed.** The widened alternative was measured —
 * `Declared | { tag: string & {}, status: number }` — and it does not cost a
 * fallback branch, it costs *all* narrowing: a missing-property error on every
 * payload in every branch. An extra open member here would break this line.
 */
type _readsBackTheDeclaredUnion = Expect<
  Equal<typeof _readerReturn, UserFailure | undefined>
>

/** And not through a collapse to `any`, which `Equal` alone would not catch. */
type _readerReturnIsNotAny = Expect<Equal<IsAny<typeof _readerReturn>, false>>

/**
 * Narrowing, with payloads intact in every branch and an exhaustiveness
 * assertion at the end.
 *
 * The `default` arm is the deploy-skew tail, stated rather than
 * engineered around: `const _never: never = failure` stays **compile-valid**
 * while being **runtime-reachable**, because a server one deploy ahead can send
 * a tag this union does not have. That is the standard closed-union-over-the-
 * wire tail; closing the union removed the only shape that could surface it.
 */
function describeDeclared(): string {
  const failure = declaredError(declaredFailure)

  // `undefined` *is* "not a declared failure", and
  // reaching it costs the caller no narrowing tax on the vanilla channel.
  if (failure === undefined) return 'not a declared failure'

  switch (failure.tag) {
    case 'user-not-found':
      return `user-not-found: ${failure.userId}`
    case 'user-suspended':
      return `user-suspended until ${failure.until}`
    case 'forbidden':
      return `forbidden, needs ${failure.requiredRole}`
    default: {
      const _never: never = failure
      return _never
    }
  }
}

/**
 * **An undeclared route falls to the second overload**, degrading to the
 * shape floor — not to `never`, and not to a compile error.
 */
const _degraded = declaredError(vanillaFailure)

type _undeclaredFallsToTheFloor = Expect<
  Equal<typeof _degraded, AnyVariant | undefined>
>

/** The floor, and not a silent `any` wearing the floor's name. */
type _degradedIsNotAny = Expect<Equal<IsAny<typeof _degraded>, false>>

/**
 * **The floor is not assignable to the declared union**, which is what makes
 * the line above a measurement rather than a restatement: were the degraded
 * branch secretly `any`, this assignment would compile and the directive would
 * be unused — `TS2578`, and this file goes red.
 */
// @ts-expect-error the shape floor is strictly weaker than the union.
const _floorIsNotTheUnion: UserFailure | undefined = _degraded

/** A `catch` binding, which is the commonest call site there is. */
declare const caught: unknown
const _fromCatch = declaredError(caught)

type _unknownFallsToTheFloor = Expect<
  Equal<typeof _fromCatch, AnyVariant | undefined>
>

/** `null` and `undefined` are accepted rather than guarded against by callers. */
const _fromNothing = declaredError(undefined)
type _nothingIsAccepted = Expect<
  Equal<typeof _fromNothing, AnyVariant | undefined>
>

// ---------------------------------------------------------------------------
// The reactive sibling
// ---------------------------------------------------------------------------

/**
 * A real Vue `Ref` of a real error, not a hand-rolled `{ value }` stand-in.
 * `E` has to infer out of a ref whose element type is a `NuxtError`, not out of
 * one written as the parameter's own shape, or the assertion below would prove
 * only that the parameter matches itself.
 */
declare const declaredFailureRef: Ref<typeof declaredFailure | undefined>

declare const vanillaFailureRef: Ref<NuxtError<unknown> | undefined>

/** The reactive sibling returns a computed of exactly the same thing. */
const _reactiveReturn = useDeclaredError(declaredFailureRef)

type _reactiveIsAComputedOfTheSame = Expect<
  Equal<typeof _reactiveReturn, ComputedRef<UserFailure | undefined>>
>

/** It degrades on the same boundary the value form does. */
const _reactiveDegraded = useDeclaredError(vanillaFailureRef)

type _reactiveDegradesToTheFloor = Expect<
  Equal<typeof _reactiveDegraded, ComputedRef<AnyVariant | undefined>>
>

/**
 * The three other ref flavours a call site can legally hold, all of which the
 * parameter has to accept.
 *
 * Measured rather than assumed: `Ref` was very nearly replaced here by a
 * read-only `{ readonly value: T }` view on the theory that a getter/setter
 * pair makes `Ref` invariant. TypeScript compares object properties covariantly
 * whether or not they are writable, so all three of these match and the extra
 * exported type bought nothing. These lines are what keeps that measurement
 * from having to be re-taken.
 */
declare const computedFailure: ComputedRef<typeof declaredFailure | undefined>
declare const shallowFailure: ShallowRef<typeof declaredFailure | undefined>
declare const readonlyFailure: Readonly<Ref<typeof declaredFailure | undefined>>

const _fromComputed = useDeclaredError(computedFailure)
const _fromShallow = useDeclaredError(shallowFailure)
const _fromReadonly = useDeclaredError(readonlyFailure)

type _everyRefFlavourInfers = Expect<
  Equal<
    | typeof _fromComputed
    | typeof _fromShallow
    | typeof _fromReadonly
    | typeof _reactiveReturn,
    ComputedRef<UserFailure | undefined>
  >
>

/**
 * **Narrowing lands on a local `const`.**
 *
 * `current` is the const, and it is the only thing that survives a `.value`
 * read: control-flow analysis does not carry a narrowing across a property
 * access on a mutable ref, and template narrowing is weaker still. The
 * exhaustive `switch` below is the assertion — it does not compile if the read
 * came back widened.
 */
function describeReactive(): string {
  const failure = useDeclaredError(declaredFailureRef)
  const current = failure.value

  if (current === undefined) return 'not a declared failure'

  switch (current.tag) {
    case 'user-not-found':
      return `user-not-found: ${current.userId}`
    case 'user-suspended':
      return `user-suspended until ${current.until}`
    case 'forbidden':
      return `forbidden, needs ${current.requiredRole}`
    default: {
      const _never: never = current
      return _never
    }
  }
}

/** Both functions are exported so the exhaustiveness above is not dead code. */
export { describeDeclared, describeReactive }
