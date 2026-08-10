import type { H3Event } from 'h3'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  defineCheckedEventHandler,
  defineError,
  payload,
} from '../../src/runtime/server'
import type { KnownRaiseInput } from '../../src/runtime/shared/wire'
import type {
  KnownErrorsOf,
  KnownErrorsOfHandler,
} from '../../src/runtime/types'

/**
 * The definition surface's compile-time contract, asserted by the compiler
 * under `pnpm typecheck`. The suite at the bottom only keeps the file in
 * vitest's inventory.
 */

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false

type Expect<T extends true> = T

// ---------------------------------------------------------------------------
// Definitions, composed by array spread
// ---------------------------------------------------------------------------

const userErrors = defineError({
  'user-not-found': { status: 404, payload: payload<{ userId: string }>() },
  'user-suspended': { status: 403, payload: payload<{ until: string }>() },
})

const orderErrors = defineError({
  'order-cancelled': { status: 410, payload: payload<{ orderId: string }>() },
  maintenance: { status: 503 },
})

const forbidden = defineError('forbidden', {
  status: 403,
  payload: payload<{ requiredRole: 'admin' | 'owner' }>(),
})

/** The other door into the payload position: any Standard Schema value. */
const rateLimited = defineError('rate-limited', {
  status: 429,
  payload: z.object({ retryAfter: z.number() }),
})

const routeErrors = [...userErrors, ...orderErrors, forbidden, rateLimited]

type RouteErrors = KnownErrorsOf<typeof routeErrors>

export type AssertTags = Expect<
  Equal<
    RouteErrors['tag'],
    | 'user-not-found'
    | 'user-suspended'
    | 'order-cancelled'
    | 'maintenance'
    | 'forbidden'
    | 'rate-limited'
  >
>

export type AssertStatusLiteral = Expect<
  Equal<Extract<RouteErrors, { tag: 'user-not-found' }>['status'], 404>
>

export type AssertPayload = Expect<
  Equal<
    Extract<RouteErrors, { tag: 'forbidden' }>['requiredRole'],
    'admin' | 'owner'
  >
>

export type AssertSchemaPayload = Expect<
  Equal<Extract<RouteErrors, { tag: 'rate-limited' }>['retryAfter'], number>
>

export const wholeGroups = defineCheckedEventHandler(
  { errors: routeErrors },
  (event, { fail }) => {
    if (event.path === 'a') return fail('user-not-found', { userId: 'u1' })
    if (event.path === 'b') return fail('forbidden', { requiredRole: 'admin' })
    if (event.path === 'c') return fail('maintenance')
    if (event.path === 'd') return fail('rate-limited', { retryAfter: 30 })
    // @ts-expect-error - undeclared tag
    if (event.path === 'e') return fail('nope')
    // @ts-expect-error - wrong payload field type
    if (event.path === 'f') return fail('user-suspended', { until: 42 })
    // @ts-expect-error - a payload-less variant takes no second argument
    if (event.path === 'g') return fail('maintenance', {})
    // @ts-expect-error - missing payload
    if (event.path === 'h') return fail('order-cancelled')
    return { ok: true }
  }
)

// ---------------------------------------------------------------------------
// `pick`
// ---------------------------------------------------------------------------

export const pickedSubset = defineCheckedEventHandler(
  { errors: [...userErrors.pick('user-not-found'), forbidden] },
  (event, { fail }) => {
    if (event.path === 'a') return fail('user-not-found', { userId: 'u1' })
    // @ts-expect-error - `user-suspended` was not picked
    if (event.path === 'b') return fail('user-suspended', { until: 'x' })
    return { ok: true }
  }
)

// Repetition and emptiness are absorbed, not rejected.
const _pickedOnce = userErrors.pick('user-not-found')
const _pickedTwice = userErrors.pick('user-not-found', 'user-not-found')
const _pickedNone = userErrors.pick()

export type AssertRepetitionCollapses = Expect<
  Equal<typeof _pickedOnce, typeof _pickedTwice>
>
export type AssertEmptyPickIsEmpty = Expect<
  Equal<KnownErrorsOf<typeof _pickedNone>, never>
>

// Overlapping picks compose without complaint - the slot's union dedupes
// itself.
const _overlappingErrors = [
  ...orderErrors.pick('order-cancelled', 'maintenance'),
  ...orderErrors.pick('order-cancelled'),
]

export type AssertOverlapDedupes = Expect<
  Equal<
    KnownErrorsOf<typeof _overlappingErrors>['tag'],
    'order-cancelled' | 'maintenance'
  >
>

export function pickStaysChecked(): void {
  // @ts-expect-error - the group never declared `nope`
  userErrors.pick('nope')
}

// ---------------------------------------------------------------------------
// The brand
// ---------------------------------------------------------------------------

export type AssertHandlerCarriesUnion = Expect<
  Equal<
    KnownErrorsOfHandler<typeof wholeGroups>['tag'],
    | 'user-not-found'
    | 'user-suspended'
    | 'order-cancelled'
    | 'maintenance'
    | 'forbidden'
    | 'rate-limited'
  >
>

// `fail` returns `never`, so the success type infers clean off the body.
export type AssertSuccessUnpolluted = Expect<
  Equal<Awaited<ReturnType<typeof wholeGroups>>, { ok: boolean }>
>

// The two degradations both land on `never`, the honest "declares none".
export type AssertUnbrandedYieldsNever = Expect<
  Equal<
    KnownErrorsOfHandler<(event: H3Event) => Promise<{ ok: boolean }>>,
    never
  >
>
export type AssertAnyYieldsNever = Expect<
  Equal<KnownErrorsOfHandler<any>, never>
>

// ---------------------------------------------------------------------------
// The divergence guard
// ---------------------------------------------------------------------------

// The same tag declared again, identically: the union collapses, nothing
// yells.
const userErrorsAgain = defineError({
  'user-not-found': { status: 404, payload: payload<{ userId: string }>() },
})

export const identicalRedeclarationPasses = defineCheckedEventHandler(
  { errors: [...userErrors, ...userErrorsAgain] },
  (event, { fail }) => {
    if (event.path === 'a') return fail('user-not-found', { userId: 'u1' })
    return { ok: true }
  }
)

export type AssertIdenticalCollapses = Expect<
  Equal<
    KnownErrorsOfHandler<typeof identicalRedeclarationPasses>['tag'],
    'user-not-found' | 'user-suspended'
  >
>

// The same tag with a different shape breaks `fail`'s payload lookup and the
// matcher's arms, so the guard names the tag in the diagnostic.
const conflictingUserErrors = defineError({ 'user-not-found': { status: 410 } })

export function divergentRedeclarationIsCaught(): void {
  defineCheckedEventHandler(
    // @ts-expect-error - `__divergentErrorTag__` names `user-not-found`
    { errors: [...userErrors, ...conflictingUserErrors] },
    () => ({ ok: true })
  )
}

// ---------------------------------------------------------------------------
// The raise-site wire contract, and the payload's serialization floor
// ---------------------------------------------------------------------------

export const raiseSiteCannotLeakTheTag: KnownRaiseInput<{
  tag: 'user-not-found'
  status: 404
}> = {
  statusCode: 404,
  message: 'user-not-found',
  // @ts-expect-error - the reason phrase survives escapes untouched, so the
  // tag must never ride it
  statusMessage: 'user-not-found',
  data: { __knownError__: { tag: 'user-not-found', status: 404 } },
}

export function payloadMustSurviveSerialization(): void {
  // @ts-expect-error - `bigint` makes `JSON.stringify` throw inside Nitro
  payload<{ amount: bigint }>()
}

/**
 * The two doors into the payload position, held to one rule: whatever
 * `payload<T>()` rejects, a schema with the same inferred output is rejected
 * for too. `Date` is the accepted half on purpose - `Serialize` maps it to
 * `string`, so it survives the wire.
 */
export function schemaOutputMustSurviveSerializationToo(): void {
  defineError(
    'paid',
    // @ts-expect-error - the schema's inferred output has a `bigint` field
    { status: 402, payload: z.object({ amount: z.bigint() }) }
  )

  // @ts-expect-error - `__unserializablePayloadField__` names the tag `paid`
  defineError({
    paid: { status: 402, payload: z.object({ amount: z.bigint() }) },
  })
}

const _datedErrors = defineError({
  'trial-expired': { status: 402, payload: z.object({ endedAt: z.date() }) },
})

/** Both doors agree on `Date`, and agree with what the wire really carries. */
export type AssertSchemaDateSurvives = Expect<
  Equal<
    Extract<
      KnownErrorsOf<typeof _datedErrors>,
      { tag: 'trial-expired' }
    >['endedAt'],
    Date
  >
>

// The phantom door, on the same `T`: accepted, so the pair really is one rule.
const _datedPhantom = payload<{ endedAt: Date }>()

describe('the definition surface', () => {
  it('is asserted by the compiler, not by this suite', () => {
    expect(typeof wholeGroups).toBe('function')
  })
})
