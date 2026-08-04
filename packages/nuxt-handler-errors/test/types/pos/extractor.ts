/**
 * The extractor, asserted hermetically (SPEC.md §4.1, §4.3, §8.3(a)).
 *
 * Hand-written handler types, no Nuxt in the path, no emitter and no running
 * server — the whole lock the design rests on is provable at the fast layer,
 * and this is where it is proved. Must compile with **zero** diagnostics
 * (SPEC.md §9.5 rule 3).
 *
 * Everything the union is claimed to be is claimed through
 * `Simplify<Serialize<…>>` — Nitro's own pair, imported rather than copied —
 * because that is the exact spelling the emitted map wraps the extractor in,
 * so an assertion written any other way would be about a type no consumer ever
 * sees.
 */

import { defineEventHandler } from 'h3'
import type {
  EventHandler,
  EventHandlerRequest,
  EventHandlerResponse,
} from 'h3'
import type { Serialize, Simplify } from 'nitropack/types'
import type {
  DeclaredErrorBody,
  ExtractErrorsSafe,
  Flatten,
  TypedEventHandler,
} from '../../../src/runtime/types'
import type { Equal, Expect, IsAny, IsNever } from '../vocabulary'
import type branded from './branded-route'

/**
 * The declared union as the emitted map will write it: the extractor wrapped in
 * Nitro's own serialization pair (SPEC.md §4.2). Named for the handler it is
 * read off, which is what distinguishes it from `pos/declare-and-raise.ts`'s
 * same-idea helper over a catalogue variant.
 */
type WireUnionOf<T> = Simplify<Serialize<ExtractErrorsSafe<T>>>

type Declared = ExtractErrorsSafe<typeof branded>

// ---------------------------------------------------------------------------
// A branded handler yields its union exactly
// ---------------------------------------------------------------------------

/**
 * The whole ticket in one assertion: three variants declared on the handler,
 * three recovered from its *type*, with literal statuses intact and `Date`
 * already told the truth about as the `string` that will actually arrive.
 */
type _wireShape = Expect<
  Equal<
    WireUnionOf<typeof branded>,
    | { tag: 'user-not-found'; status: 404; userId: string }
    | { tag: 'user-suspended'; status: 403; until: string }
    | { tag: 'quota-exceeded'; status: 429 }
  >
>

/** Rule 1: "must not be `any`" is the claim, so `IsAny` is what makes it. */
type _declaredNotCollapsed = Expect<Equal<IsAny<Declared>, false>>

/**
 * The extractor's answer never carries an `undefined` arm, whatever put one in
 * the brand slot — which is what `Exclude<…, undefined>` is for.
 *
 * Measured, so the guard is not superstition and not vacuous either: `infer` on
 * an *optional* property yields the declared type on its own, with or without
 * `exactOptionalPropertyTypes`, so the union `defineTypedEventHandler` puts
 * there cannot exercise this. A hand-written `TypedEventHandler` — a handler
 * from a layer or a published package, which is the case ticket 05 exists to
 * keep working — can, and one `undefined` arm reaching a consumer's `switch`
 * would make every branch of it optional.
 */
declare const _brandCarryingUndefined: TypedEventHandler<
  EventHandlerRequest,
  EventHandlerResponse,
  { tag: 'hand-written'; status: 418 } | undefined
>

type _undefinedIsStripped = Expect<
  Equal<
    ExtractErrorsSafe<typeof _brandCarryingUndefined>,
    { tag: 'hand-written'; status: 418 }
  >
>

// ---------------------------------------------------------------------------
// Narrowing on the tag, with payloads intact in every branch
// ---------------------------------------------------------------------------

/**
 * The consumer's `switch`, written against the flattened wire union — which is
 * the shape a call site will actually hold.
 *
 * Each branch reads its **own** payload field and nothing else, and the
 * `default` arm's `never` annotation is the exhaustiveness check: adding a
 * fourth variant to the catalogue stops this compiling.
 */
function _describe(variant: Flatten<WireUnionOf<typeof branded>>): string {
  switch (variant.tag) {
    case 'user-not-found':
      return `${variant.status}: ${variant.userId}`
    case 'user-suspended':
      return `${variant.status}: until ${variant.until}`
    case 'quota-exceeded':
      return `${variant.status}`
    default: {
      const exhaustive: never = variant
      return exhaustive
    }
  }
}

// ---------------------------------------------------------------------------
// An unbranded handler yields `never`, with no special case
// ---------------------------------------------------------------------------

declare const plain: EventHandler

/**
 * A plain `EventHandler` has no property in common with a target whose only
 * member is the optional brand, so the relation fails and the extractor's own
 * false branch answers. Nothing in the extractor knows this case exists.
 */
type _unbrandedIsUndeclared = Expect<IsNever<ExtractErrorsSafe<typeof plain>>>

/** The same through a handler value rather than a bare type. */
const _unbrandedValue = defineEventHandler(() => ({ ok: true }))

type _unbrandedValueIsUndeclared = Expect<
  IsNever<ExtractErrorsSafe<typeof _unbrandedValue>>
>

/**
 * And `never` rather than `unknown`, which is the load-bearing half: an
 * unbranded route is an *undeclared* route (SPEC.md §6.1), and `unknown` would
 * poison the narrowing at every call site that touched it.
 */
type _unbrandedIsNotUnknown = Expect<
  Equal<Equal<ExtractErrorsSafe<typeof plain>, unknown>, false>
>

/**
 * The brand is **optional and not function-typed**, so the branded type stays
 * inhabited by any plain event handler — which is what lets the emitted map key
 * every route Nitro knows rather than only the branded ones (SPEC.md §4.1).
 */
const _plainInhabitsTheBrand: TypedEventHandler = plain

// ---------------------------------------------------------------------------
// An untyped route yields `never`, and the `IsAny` guard is what does it
// ---------------------------------------------------------------------------

/**
 * `typeof import('./legacy.js').default` for a `.js` route is `any`, and this
 * is the one the whole guard exists for (SPEC.md §4.3 mandate 1).
 */
type _anyIsUndeclared = Expect<IsNever<ExtractErrorsSafe<any>>>

/**
 * The same extractor **without** the guard — the mistake the mandate forbids,
 * written out so that what the guard buys is a measured difference rather than
 * a claim in a comment.
 *
 * `any` distributes down both arms of a conditional, so the true branch runs
 * with `E = unknown` and wins the union. That `unknown` then destroys narrowing
 * everywhere it reaches, silently, with no diagnostic anywhere near the route
 * that caused it.
 */
type ExtractErrorsUnguarded<T> = T extends { __declaredErrors__?: infer E }
  ? Exclude<E, undefined>
  : never

type _unguardedAnswersUnknown = Expect<
  Equal<ExtractErrorsUnguarded<any>, unknown>
>

/** The guard changes that answer, and changes nothing else. */
type _guardOnlyTouchesAny = Expect<
  Equal<ExtractErrorsUnguarded<typeof branded>, Declared>
>

// ---------------------------------------------------------------------------
// The vanilla-stays-clean lock, computed rather than assumed
// ---------------------------------------------------------------------------

/**
 * The route's entry as **vanilla** computes it: `ReturnType` reads only the
 * call signature and `Serialize` runs after it, so the brand and the response
 * payload occupy disjoint type positions (SPEC.md §4.1).
 */
type VanillaEntry = Simplify<Serialize<Awaited<ReturnType<typeof branded>>>>

/**
 * The one property that, if it silently broke, would poison every non-wrapper
 * call site in every consuming app with no other signal. Asserted on the key
 * set, so a leak of any shape — the brand itself, or a variant smuggled in
 * beside it — is a failure rather than a near miss.
 */
type _brandIsAbsentFromVanilla = Expect<
  IsNever<Extract<keyof VanillaEntry, '__declaredErrors__'>>
>

type _noVariantLeaksIntoVanilla = Expect<
  IsNever<Extract<VanillaEntry, { tag: 'user-not-found' }>>
>

/**
 * The same handler body written the way it would have been before this module
 * existed. Vanilla's view of the two is the *same type* — which is the strong
 * form of the claim, and the only one that would notice the brand widening the
 * success type rather than appearing in it.
 */
const _vanillaTwin = defineEventHandler(async (event) => {
  const id = event.path.slice(1)
  return { id, name: `User ${id}` }
})

type _vanillaIsUnchanged = Expect<
  Equal<
    VanillaEntry,
    Simplify<Serialize<Awaited<ReturnType<typeof _vanillaTwin>>>>
  >
>

// ---------------------------------------------------------------------------
// The `Flatten` mandate (SPEC.md §8.3(a))
// ---------------------------------------------------------------------------

/**
 * A variant as declared: `{ tag; status } & P`, an **intersection**, which is
 * what `VariantsOf` produces and what every later ticket forwards on.
 */
type RawVariant = Extract<Declared, { tag: 'user-not-found' }>

/** The collapse, which is what `Flatten` is for. */
type _flattenCollapses = Expect<
  Equal<
    Flatten<RawVariant>,
    { tag: 'user-not-found'; status: 404; userId: string }
  >
>

/**
 * The failure direction, without which the assertion above proves nothing: the
 * intersection is **not** already that object type, so something had to happen.
 */
type _intersectionIsNotAlreadyFlat = Expect<
  Equal<
    Equal<RawVariant, { tag: 'user-not-found'; status: 404; userId: string }>,
    false
  >
>

/** Lossless on a discriminated union that is already flat. */
type _flattenIsLossless = Expect<
  Equal<Flatten<WireUnionOf<typeof branded>>, WireUnionOf<typeof branded>>
>

/**
 * Distributive, so a union of three variants stays three flat members rather
 * than becoming one merged object carrying every payload field — a merge would
 * make every `switch` in every consuming app accept fields the branch cannot
 * have.
 *
 * Measured: `T extends unknown` is **not** what buys this. `{ [K in keyof T]:
 * T[K] }` over a naked type parameter is a homomorphic mapped type and
 * distributes over a union on its own, so removing the conditional changes
 * nothing. The spelling is kept because SPEC.md §8.3(a) fixes it, and the
 * assertion is kept because it does bite a genuinely non-distributive rewrite
 * — `Pick<T, keyof T>`, say, which merges the three into one.
 */
type _flattenDistributes = Expect<
  Equal<
    Flatten<Declared>['tag'],
    'user-not-found' | 'user-suspended' | 'quota-exceeded'
  >
>

/**
 * The rendering half, as a matched pair (SPEC.md §9.3) — measured in
 * `../extractor.test.ts`, which is the only place a *rendering* can be
 * asserted.
 *
 * `DeclaredErrorBody` is the first type in this package that forwards a variant
 * union on as a type argument, and it is imported here so the pair is measured
 * on the type the later tickets will actually hold.
 */
declare const _hoverRawVariant: RawVariant
declare const _hoverFlatVariant: Flatten<RawVariant>
declare const _hoverEnvelope: DeclaredErrorBody<
  Flatten<WireUnionOf<typeof branded>>
>
