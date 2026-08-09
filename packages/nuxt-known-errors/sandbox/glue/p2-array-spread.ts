// Proposal 2 — groups are ARRAYS of singles with a `.pick()`; the handler
// slot is an array of singles. Spread is the composition operator.
//
//   defineError('forbidden', def)   → KnownError                  (a single)
//   defineError({ tag: def, … })    → KnownErrorGroup              (an array)
//   errors: [...users, ...orders, forbidden]
//   pick:   [...users.pick('user-not-found'), forbidden]
//
// The slot only ever holds singles, so extraction is one conditional over the
// element union. The cost is that a group is opaque as a collection — there is
// no way to reach ONE member as a value (`users[0]` is the union, not a
// member), so `.pick()` is the only subsetting operator and it restates tags
// as strings.

import type {
  Defs,
  Equal,
  Expect,
  H3Event,
  HandlerContext,
  IsAny,
  KnownError,
  KnownVariant,
  VariantDef,
  VariantOfDef,
  VariantsOf,
} from './shared'
import { payload } from './shared'

// --- The surface -----------------------------------------------------------

/** A group: an array of singles over the union, plus the subsetting method.
 * `pick` takes any number of tags and is DELIBERATELY permissive about
 * repetition: `K[number]` is a union, and a union dedupes itself, so a tag
 * listed twice narrows to exactly what listing it once does. No guard yells;
 * the contract is on the return — the runtime hands back one error per
 * distinct tag (a standing requirement for the implementation, since the
 * types cannot police what JavaScript callers pass either way). */
export interface KnownErrorGroup<E extends KnownVariant> extends ReadonlyArray<
  KnownError<E>
> {
  pick: <const K extends readonly E['tag'][]>(
    ...tags: K
  ) => KnownErrorGroup<Extract<E, { tag: K[number] }>>
}

export interface DefineError {
  /** One definition → one error value. */
  <Tag extends string, const D extends VariantDef>(
    tag: Tag,
    def: D
  ): KnownError<VariantOfDef<Tag, D>>

  /** Several definitions → a spreadable group. */
  <const D extends Defs>(defs: D): KnownErrorGroup<VariantsOf<D>>
}

export declare const defineError: DefineError

/** The union declared by the slot. Distributes over the element union. */
export type ErrorsOfArray<A extends ReadonlyArray<KnownError<KnownVariant>>> =
  A[number] extends KnownError<infer E> ? E : never

// --- The divergence guard --------------------------------------------------

type IsUnion<T, U = T> = T extends any
  ? [U] extends [T]
    ? false
    : true
  : never

/** The tags whose variants appear more than once in the slot's union. A
 * variant listed twice IDENTICALLY collapses when the union forms and never
 * reaches this — repetition stays free. Only the same tag declared again
 * with a different status or payload survives as two members sharing one
 * discriminant, which breaks `fail`'s payload lookup and the matcher's arms
 * alike — a genuine bug, not a redundancy. */
export type DivergentTags<E extends KnownVariant> = {
  [K in E['tag']]: IsUnion<Extract<E, { tag: K }>> extends true ? K : never
}[E['tag']]

/** Surfaces a divergent tag as a missing property whose template-literal
 * type names it verbatim. Intersected FIRST in the options type — TypeScript
 * truncates the tail of a rendered type, and guard-last buries the message
 * (the old package's measured lesson). */
export type ConflictGuard<A extends ReadonlyArray<KnownError<KnownVariant>>> = [
  DivergentTags<ErrorsOfArray<A>>,
] extends [never]
  ? // `{}` is the identity element for `&`.
    // eslint-disable-next-line ts/no-empty-object-type
    {}
  : {
      __divergentErrorTag__: `Tag declared more than once with different shapes: ${DivergentTags<ErrorsOfArray<A>> & string}`
    }

// --- The handler and its brand ---------------------------------------------

/** The returned handler, carrying the declared union as an OPTIONAL phantom —
 * optional so any plain event handler still inhabits the type. This brand is
 * the only channel the emitter has: the generated map (`KnownApiErrors` in
 * the fixtures) is derived from handler types, so without it the whole
 * client surface reads `never`. */
export interface CheckedEventHandler<Response, E extends KnownVariant> {
  (event: H3Event): Promise<Awaited<Response>>
  __knownErrors__?: E
}

/** The emitter's read of the brand. Guarded twice: `IsAny` because an
 * untyped handler must not match with `E = unknown` and destroy narrowing
 * (§6), and `Exclude<…, undefined>` because an UNBRANDED function still
 * matches an all-optional property shape — measured: it infers
 * `E = undefined` (not `unknown`), so the Exclude alone degrades it to
 * `never`, the honest "declares none". An `unknown extends E` belt was tried
 * on top and measured dead — this case never produces `unknown`. */
export type KnownErrorsOfHandler<T> =
  IsAny<T> extends true
    ? never
    : T extends { __knownErrors__?: infer E }
      ? Exclude<E, undefined>
      : never

export interface DefineCheckedEventHandler {
  <A extends ReadonlyArray<KnownError<KnownVariant>>, Response>(
    options: ConflictGuard<A> & { errors: A },
    handler: (event: H3Event, ctx: HandlerContext<ErrorsOfArray<A>>) => Response
  ): CheckedEventHandler<Response, ErrorsOfArray<A>>
}

export declare const defineCheckedEventHandler: DefineCheckedEventHandler

// --- The raise-site wire contract ------------------------------------------

/** What the implementation's raise is allowed to hand `createError`. The
 * `statusMessage?: never` is §2's standing constraint made structural: an
 * escaped server-to-server throw forwards the reason phrase untouched even
 * while everything else is scrubbed (§5), so the tag must never ride it —
 * writing `statusMessage: tag` is exactly how the old package leaked.
 * `message` MAY carry the tag: the prod handler scrubs it on any escape, so
 * it only ever reaches the route's own client, which knows the tag already. */
export interface KnownRaiseInput<E extends KnownVariant> {
  statusCode: number
  message: string
  data: { __knownError__: E }
  statusMessage?: never
}

// --- Evidence --------------------------------------------------------------

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

// Two groups and a single, composed by array spread.
const routeErrors = [...userErrors, ...orderErrors, forbidden]

type RouteErrors = ErrorsOfArray<typeof routeErrors>

export type AssertTags = Expect<
  Equal<
    RouteErrors['tag'],
    | 'user-not-found'
    | 'user-suspended'
    | 'order-cancelled'
    | 'maintenance'
    | 'forbidden'
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

export const wholeGroups = defineCheckedEventHandler(
  { errors: routeErrors },
  (event, { fail }) => {
    if (event.path === 'a') return fail('user-not-found', { userId: 'u1' })
    if (event.path === 'b') return fail('forbidden', { requiredRole: 'admin' })
    if (event.path === 'c') return fail('maintenance')
    // @ts-expect-error — undeclared tag
    if (event.path === 'd') return fail('nope')
    // @ts-expect-error — wrong payload field type
    if (event.path === 'e') return fail('user-suspended', { until: 42 })
    // @ts-expect-error — a payload-less variant takes no second argument
    if (event.path === 'f') return fail('maintenance', {})
    // @ts-expect-error — missing payload
    if (event.path === 'g') return fail('order-cancelled')
    return { ok: true }
  }
)

export const pickedSubset = defineCheckedEventHandler(
  { errors: [...userErrors.pick('user-not-found'), forbidden] },
  (event, { fail }) => {
    if (event.path === 'a') return fail('user-not-found', { userId: 'u1' })
    // @ts-expect-error — `user-suspended` was not picked
    if (event.path === 'b') return fail('user-suspended', { until: 'x' })
    return { ok: true }
  }
)

// Overlapping picks compose without complaint — the slot's union dedupes
// itself, so the handler is declared over each tag exactly once no matter how
// many entries mention it. The matching runtime requirement (the handler's
// resolved errors list holds one entry per distinct tag) rides along for the
// implementation step.
const overlappingErrors = [
  ...orderErrors.pick('order-cancelled', 'maintenance'),
  ...orderErrors.pick('order-cancelled'),
]

export type AssertOverlapDedupes = Expect<
  Equal<
    ErrorsOfArray<typeof overlappingErrors>['tag'],
    'order-cancelled' | 'maintenance'
  >
>

export const pickedSeveral = defineCheckedEventHandler(
  { errors: overlappingErrors },
  (event, { fail }) => {
    if (event.path === 'a') return fail('order-cancelled', { orderId: 'o1' })
    if (event.path === 'b') return fail('maintenance')
    // @ts-expect-error — `forbidden` belongs to a different group entirely
    if (event.path === 'c') return fail('forbidden', { requiredRole: 'admin' })
    return { ok: true }
  }
)

// Repetition and emptiness are absorbed, not rejected: a tag picked twice is
// the same subset as picked once, and picking nothing is the empty group.
// Only a tag the group never declared is still a compile error.
const _pickedOnce = userErrors.pick('user-not-found')
const _pickedTwice = userErrors.pick('user-not-found', 'user-not-found')
const _pickedNone = userErrors.pick()

export type AssertRepetitionCollapses = Expect<
  Equal<typeof _pickedOnce, typeof _pickedTwice>
>
export type AssertEmptyPickIsEmpty = Expect<
  Equal<ErrorsOfArray<typeof _pickedNone>, never>
>

export const pickStaysChecked = (): void => {
  // @ts-expect-error — the group never declared `nope`
  userErrors.pick('nope')
}

// --- Evidence: the brand ---------------------------------------------------

// The handler carries its union out — this is what the emitter reads, and
// what makes the server glue and the client call sites two ends of one wire.
export type AssertHandlerCarriesUnion = Expect<
  Equal<
    KnownErrorsOfHandler<typeof wholeGroups>['tag'],
    | 'user-not-found'
    | 'user-suspended'
    | 'order-cancelled'
    | 'maintenance'
    | 'forbidden'
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

// --- Evidence: the divergence guard ----------------------------------------

// The same tag declared AGAIN, identically, in a separate `defineError` call:
// the two variants are the same type, the union collapses, nothing yells.
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

// The same tag with a DIFFERENT shape is two union members sharing one
// discriminant — `fail`'s payload lookup and the matcher's arms both break
// on it, so the guard catches it and names the tag in the diagnostic.
const conflictingUserErrors = defineError({
  'user-not-found': { status: 410 },
})

export const divergentRedeclarationIsCaught = (): void => {
  defineCheckedEventHandler(
    // @ts-expect-error — `__divergentErrorTag__` names `user-not-found`
    { errors: [...userErrors, ...conflictingUserErrors] },
    () => ({ ok: true })
  )
}

// --- Evidence: the raise-site wire contract --------------------------------

declare function raiseKnown<E extends KnownVariant>(
  input: KnownRaiseInput<E>
): never

export const raiseSiteConforms = (): never =>
  raiseKnown({
    statusCode: 404,
    message: 'user-not-found',
    data: {
      __knownError__: { tag: 'user-not-found', status: 404, userId: 'u1' },
    },
  })

export const raiseSiteCannotLeakTheTag = (): never =>
  raiseKnown({
    statusCode: 404,
    message: 'user-not-found',
    // @ts-expect-error — §5's standing constraint, structural: the reason
    // phrase survives escapes untouched, so the tag must never ride it
    statusMessage: 'user-not-found',
    data: { __knownError__: { tag: 'user-not-found', status: 404 } },
  })
