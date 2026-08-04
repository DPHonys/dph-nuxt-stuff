/**
 * The declaration surface, asserted where it is decided (SPEC.md §3.1, §3.2).
 *
 * Must compile with **zero** diagnostics (SPEC.md §9.5 rule 3). Everything
 * structural about `defineErrors`, `payload`, `.pick()` and
 * `defineTypedEventHandler` is claimed here; the things that must *not* compile
 * are claimed one file at a time in `../neg/`.
 *
 * Variant shapes are asserted through `Simplify<Serialize<…>>` — Nitro's own
 * chain, imported rather than reimplemented — because that is what the
 * generated map will run them through and it is the only spelling that proves
 * a payload survives the wire rather than merely type-checks.
 */

import type { EventHandler } from 'h3'
import type { Serialize, Simplify } from 'nitropack/types'
import {
  defineErrors,
  defineTypedEventHandler,
  payload,
} from '../../../src/runtime/shared'
import type { AnyVariant, ErrorCatalogue } from '../../../src/runtime/types'
import type { Equal, Expect, IsAny, IsNever } from '../vocabulary'

/** Reads a catalogue value's declared union back out of its type. */
type VariantsIn<C> = C extends ErrorCatalogue<infer E> ? E : never

/** The shape the wire and the generated map will actually carry. */
type OnTheWire<E extends AnyVariant, T extends E['tag']> = Simplify<
  Serialize<Extract<E, { tag: T }>>
>

const userErrors = defineErrors({
  'user-not-found': { status: 404, payload: payload<{ userId: string }>() },
  'user-suspended': {
    status: 403,
    payload: payload<{ until: string; reason: 'fraud' | 'abuse' }>(),
  },
})

const authErrors = defineErrors({
  unauthorized: { status: 401 },
  forbidden: {
    status: 403,
    payload: payload<{ requiredRole: 'admin' | 'owner' }>(),
  },
  'token-expired': { status: 401, payload: payload<{ expiredAt: string }>() },
})

type UserVariants = VariantsIn<typeof userErrors>
type AuthVariants = VariantsIn<typeof authErrors>

// ---------------------------------------------------------------------------
// Literal types survive, and status is inline per variant with no default
// ---------------------------------------------------------------------------

/**
 * A status written as `404` stays `404` — not `number`, and not a defaulted
 * 400. This is what SPEC.md §3.2 buys by making `defineErrors`' type parameter
 * `const` and by refusing to give `status` a default.
 */
type _notFound = Expect<
  Equal<
    OnTheWire<UserVariants, 'user-not-found'>,
    { tag: 'user-not-found'; status: 404; userId: string }
  >
>

/** A payload union stays that union rather than widening to `string`. */
type _suspended = Expect<
  Equal<
    OnTheWire<UserVariants, 'user-suspended'>,
    {
      tag: 'user-suspended'
      status: 403
      until: string
      reason: 'fraud' | 'abuse'
    }
  >
>

/** A payload-less variant carries exactly the two reserved names and no more. */
type _unauthorized = Expect<
  Equal<
    OnTheWire<AuthVariants, 'unauthorized'>,
    { tag: 'unauthorized'; status: 401 }
  >
>

/** Rule 1: "must not be `any`" is the claim, so `IsAny` is what makes it. */
type _variantsNotCollapsed = Expect<Equal<IsAny<UserVariants>, false>>

// ---------------------------------------------------------------------------
// `payload<T>()` accepts everything that survives `Serialize`
// ---------------------------------------------------------------------------

const _auditErrors = defineErrors({
  'audit-locked': {
    status: 409,
    payload: payload<{
      at: Date
      tags: string[]
      note?: string
      previous: { by: string } | null
    }>(),
  },
})

/**
 * `Date` → `string` is fine and must not be rejected (SPEC.md §3.2). Asserting
 * the *serialized* shape is what proves both halves at once: the guard let it
 * through, and the client will be told the truth about what arrives.
 */
type _audit = Expect<
  Equal<
    OnTheWire<VariantsIn<typeof _auditErrors>, 'audit-locked'>,
    {
      tag: 'audit-locked'
      status: 409
      at: string
      tags: string[]
      note?: string
      previous: { by: string } | null
    }
  >
>

// ---------------------------------------------------------------------------
// `.pick()`
// ---------------------------------------------------------------------------

const _picked = authErrors.pick('forbidden', 'unauthorized')

type _pickKeeps = Expect<
  Equal<VariantsIn<typeof _picked>['tag'], 'forbidden' | 'unauthorized'>
>

/** The dropped variant is genuinely gone, not merely deprioritised. */
type _pickDrops = Expect<
  IsNever<Extract<VariantsIn<typeof _picked>, { tag: 'token-expired' }>>
>

/** A picked catalogue is still a catalogue, so it composes like any other. */
type _pickComposes = Expect<
  Equal<typeof _picked extends ErrorCatalogue<AnyVariant> ? true : false, true>
>

// ---------------------------------------------------------------------------
// The handler
// ---------------------------------------------------------------------------

const _handler = defineTypedEventHandler(
  { errors: [userErrors, authErrors.pick('forbidden')] },
  async (event, { fail }) => {
    const id = event.path

    if (id === '/missing') return fail('user-not-found', { userId: id })
    if (id === '/private') return fail('forbidden', { requiredRole: 'owner' })

    return { id, name: `User ${id}`, email: `${id}@example.com` }
  }
)

/**
 * **The property everything downstream depends on**, asserted through the real
 * serialization chain rather than on paper: the success type infers from the
 * body with no annotation, and the three `return fail(…)` exits contribute
 * nothing to it because `fail` returns `never` (SPEC.md §3.1).
 */
type _successInfers = Expect<
  Equal<
    Simplify<Serialize<Awaited<ReturnType<typeof _handler>>>>,
    { id: string; name: string; email: string }
  >
>

type _successNotCollapsed = Expect<
  Equal<IsAny<Awaited<ReturnType<typeof _handler>>>, false>
>

/**
 * The route stays assignable to a plain event handler, so Nitro, the router and
 * every h3 utility keep treating it as ordinary. The brand rides a *sibling*
 * property of the call signature, which is why this holds structurally.
 */
const _asPlain: EventHandler = _handler

/** The declared union reached the brand — both catalogues, `.pick()` applied. */
type Declared = NonNullable<(typeof _handler)['__declaredErrors__']>

type _brandCarriesTheUnion = Expect<
  Equal<Declared['tag'], 'user-not-found' | 'user-suspended' | 'forbidden'>
>

/** What `.pick()` dropped never reaches the route's published contract. */
type _brandRespectsPick = Expect<
  IsNever<Extract<Declared, { tag: 'token-expired' }>>
>

type _brandNotCollapsed = Expect<Equal<IsAny<Declared>, false>>

/**
 * The brand and the payload occupy disjoint type positions: `ReturnType` reads
 * only the call signature, so nothing about the declared union can leak into
 * what a vanilla `useFetch` sees (SPEC.md §4.1).
 */
type _brandIsNotInTheReturnType = Expect<
  IsNever<
    Extract<Awaited<ReturnType<typeof _handler>>, { tag: 'user-not-found' }>
  >
>

// ---------------------------------------------------------------------------
// The escape hatch (SPEC.md §6.3)
// ---------------------------------------------------------------------------

/**
 * `.raise()` is reachable from helper code that has no `fail` in scope, and it
 * is **deliberately unenforced** — this call sits outside every handler and
 * nothing checks that any route declared the variant.
 */
function _assertUser(found: boolean): asserts found is true {
  if (!found) userErrors.raise('user-not-found', { userId: 'unknown' })
}

/**
 * It returns `never`, which is what lets it stand as the whole body of a
 * narrowing helper without an unreachable `throw` after it.
 */
type _raiseIsNever = Expect<
  Equal<ReturnType<typeof userErrors.raise<'user-not-found'>>, never>
>

// ---------------------------------------------------------------------------
// Hover legibility (SPEC.md §8.3(b))
// ---------------------------------------------------------------------------

/**
 * Every callable is a named `interface` with the value a `const` of that type,
 * so a hover renders the interface's *name* rather than an expanded signature.
 * Measured on the prototype at 1075 characters the other way. All three are
 * budgeted in `../declare-and-raise.test.ts`, which records the good/bad pair
 * measured against this fixture.
 */
const _hoverDefineTypedEventHandler = defineTypedEventHandler
const _hoverDefineErrors = defineErrors
const _hoverPayload = payload
