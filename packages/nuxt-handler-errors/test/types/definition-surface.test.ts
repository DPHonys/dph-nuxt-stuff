import type { H3Event } from 'h3'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  defineCheckedEventHandler,
  defineError,
} from '../../src/runtime/server'
import type { KnownRaiseInput } from '../../src/runtime/shared/wire'
import type {
  ErrorFactories,
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

const userId = z.object({ userId: z.string() })

const userErrors = defineError({
  'user-not-found': { status: 404, payload: userId },
  'user-suspended': { status: 403, payload: z.object({ until: z.string() }) },
})

const orderErrors = defineError({
  'order-cancelled': {
    status: 410,
    payload: z.object({ orderId: z.string() }),
  },
  maintenance: { status: 503 },
})

const forbidden = defineError('forbidden', {
  status: 403,
  payload: z.object({ requiredRole: z.enum(['admin', 'owner']) }),
})

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
  (event, { errors }) => {
    if (event.path === 'a') throw errors.userNotFound({ userId: 'u1' })
    if (event.path === 'b') throw errors.forbidden({ requiredRole: 'admin' })
    if (event.path === 'c') throw errors.maintenance()
    if (event.path === 'd') throw errors.rateLimited({ retryAfter: 30 })
    // @ts-expect-error - undeclared tag
    if (event.path === 'e') throw errors.nope()
    // @ts-expect-error - wrong payload field type
    if (event.path === 'f') throw errors.userSuspended({ until: 42 })
    // @ts-expect-error - a payload-less variant takes no second argument
    if (event.path === 'g') throw errors.maintenance({})
    // @ts-expect-error - missing payload
    if (event.path === 'h') throw errors.orderCancelled()
    return { ok: true }
  }
)

// ---------------------------------------------------------------------------
// `pick`
// ---------------------------------------------------------------------------

export const pickedSubset = defineCheckedEventHandler(
  { errors: [...userErrors.pick('user-not-found'), forbidden] },
  (event, { errors }) => {
    if (event.path === 'a') throw errors.userNotFound({ userId: 'u1' })
    // @ts-expect-error - `user-suspended` was not picked
    if (event.path === 'b') throw errors.userSuspended({ until: 'x' })
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

// Throwing factory results leaves the inferred success type unpolluted.
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

// The same tag declared again with the same status and schema: the union
// collapses, nothing yells.
const userErrorsAgain = defineError({
  'user-not-found': { status: 404, payload: userId },
})

export const identicalRedeclarationPasses = defineCheckedEventHandler(
  { errors: [...userErrors, ...userErrorsAgain] },
  (event, { errors }) => {
    if (event.path === 'a') throw errors.userNotFound({ userId: 'u1' })
    return { ok: true }
  }
)

export type AssertIdenticalCollapses = Expect<
  Equal<
    KnownErrorsOfHandler<typeof identicalRedeclarationPasses>['tag'],
    'user-not-found' | 'user-suspended'
  >
>

// The same tag with a different shape breaks the factory payload lookup and the
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

/**
 * Whatever a schema infers as its output must survive `JSON.stringify` inside
 * Nitro without replacing the variant's tag and status. Nested `Date` fields
 * are accepted because `Serialize` maps them to strings.
 */
export function schemaOutputMustSurviveSerialization(): void {
  // @ts-expect-error a root Date serializes away the variant tag and status
  defineError('dated', { status: 400, payload: z.date() })
  // @ts-expect-error root toJSON replaces the whole variant on the wire
  defineError('custom', {
    status: 400,
    payload: z
      .string()
      .transform(() => ({ toJSON: () => ({ value: 'lost floor' }) })),
  })
  // @ts-expect-error groups reject root toJSON too
  defineError({ dated: { status: 400, payload: z.date() } })
  // @ts-expect-error a valid branch cannot hide a root toJSON branch
  defineError('union', {
    status: 400,
    payload: z.union([z.object({ value: z.string() }), z.date()]),
  })
  // @ts-expect-error the reserved `tag` field cannot overwrite the floor
  defineError('bad', { status: 404, payload: z.object({ tag: z.string() }) })
  defineError(
    'paid',
    // @ts-expect-error - the schema's inferred output has a `bigint` field
    { status: 402, payload: z.object({ amount: z.bigint() }) }
  )

  // @ts-expect-error - `__invalidPayload__` names the tag `paid`
  defineError({
    paid: { status: 402, payload: z.object({ amount: z.bigint() }) },
  })
}

// ---------------------------------------------------------------------------
// Tags are kebab-case: `user-not-found` on the wire, `errors.userNotFound`
// ---------------------------------------------------------------------------

export function tagsMustBeKebabCase(): void {
  // @ts-expect-error - `__invalidTag__` names `userNotFound`
  defineError('userNotFound', { status: 404 })
  // @ts-expect-error - `__invalidTag__` names `userNotFound`
  defineError({ userNotFound: { status: 404 } })
  // @ts-expect-error - a leading digit is not a tag
  defineError('404', { status: 404 })
  // @ts-expect-error - an empty tag is not a tag
  defineError('', { status: 404 })
  // @ts-expect-error - a double separator
  defineError('user--gone', { status: 404 })
  // @ts-expect-error - a trailing separator
  defineError('user-', { status: 404 })
  // @ts-expect-error - a separator must be followed by a letter
  defineError('a-1b', { status: 404 })
  // @ts-expect-error - `_` and `$` are not tag characters
  defineError('$ok_1', { status: 404 })
  // @ts-expect-error - ASCII only: `Δ` is a JavaScript identifier, not a tag
  defineError({ Δ: { status: 404 } })
  // Kebab-case and single lowercase words are accepted verbatim.
  defineError('user-not-found', { status: 404 })
  defineError({ v2: { status: 404 }, 'rate-limited-v2': { status: 410 } })
}

/** The factory name is the tag in camelCase. */
export type AssertFactoryNames = Expect<
  Equal<
    keyof ErrorFactories<typeof _factoryErrors>,
    'userNotFound' | 'rateLimitedV2' | 'single'
  >
>

const _factoryErrors = [
  ...defineError({
    'user-not-found': { status: 404 },
    'rate-limited-v2': { status: 429 },
    single: { status: 410 },
  }),
]

const _datedErrors = defineError({
  'trial-expired': { status: 402, payload: z.object({ endedAt: z.date() }) },
})

/** A nested `Date` field is typed as what the wire really carries. */
export type AssertSchemaDateSurvives = Expect<
  Equal<
    Extract<
      KnownErrorsOf<typeof _datedErrors>,
      { tag: 'trial-expired' }
    >['endedAt'],
    Date
  >
>

describe('the definition surface', () => {
  it('is asserted by the compiler, not by this suite', () => {
    expect(typeof wholeGroups).toBe('function')
  })
})
