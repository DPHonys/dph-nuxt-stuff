import type { EventHandlerRequest, EventHandlerResponse, H3Event } from 'h3'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  defineValidation,
  defineValidatedEventHandler,
} from '../../src/runtime/server'
import type {
  ValidateSchemas,
  ValidatedContext,
  ValidationFragment,
} from '../../src/runtime/types'
import type { MergedContext } from '../../src/runtime/types/composition'
import type { OnlyValidationSources } from '../../src/runtime/types/guard'

/**
 * The source-key guard, asserted by the compiler under `pnpm typecheck`: a
 * stray or misspelled source key is refused on every door, including beside
 * valid keys.
 *
 * Ported from the prototype's `probe-source-key-guard.ts`, counterfactuals
 * included: each of the guard's three parts was established by a variant that
 * failed, and the variants are what make these assertions proofs rather than
 * restatements - the reasoning behind each part lives on the types in
 * `src/runtime/types/guard.ts`. What an author actually *reads* when they trip
 * one is asserted next door, in `misuse-diagnostics.test.ts`.
 *
 * The suite at the bottom only keeps the file in vitest's inventory.
 */

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false

type Expect<T extends true> = T

const pageQuery = z.object({ page: z.coerce.number(), size: z.coerce.number() })
const userBody = z.object({ name: z.string() })

const pagination = defineValidation('pagination', { query: pageQuery })
const sorting = defineValidation('sorting', {
  query: z.object({ sort: z.enum(['asc', 'desc']) }),
})

// ---------------------------------------------------------------------------
// A stray key BESIDE valid ones, on every door. This is the case the guard
// exists for: the sole-key case was already rejected, one valid key beside it
// was not.
// ---------------------------------------------------------------------------

// @ts-expect-error - stray key beside a valid one, flat form
defineValidatedEventHandler({ query: pageQuery, boyd: userBody }, () => 'x')

// @ts-expect-error - stray key beside a valid one, array form
defineValidatedEventHandler([{ query: pageQuery, boyd: userBody }], () => 'x')

// @ts-expect-error - and beside a valid one in a fragment composed with a set
defineValidatedEventHandler(
  [...pagination, { body: userBody, qeury: pageQuery }],
  () => 'x'
)

// The definer's arity overloads have nothing to collapse, so these two report
// at the offending property - once, in the file that declares the set, rather
// than at every route that spreads it.
defineValidation({
  query: pageQuery,
  // @ts-expect-error - stray key beside a valid one, unnamed definer arity
  boyd: userBody,
})

defineValidation('page', {
  query: pageQuery,
  // @ts-expect-error - stray key beside a valid one, named definer arity
  boyd: userBody,
})

// ---------------------------------------------------------------------------
// The set-name symbol is exempt, or every named set is a stray key.
// ---------------------------------------------------------------------------

defineValidatedEventHandler([...pagination, ...sorting], (event, { query }) => {
  type _keys = Expect<Equal<keyof typeof query, 'pagination' | 'sorting'>>

  return query.pagination.page
})

/** The guard with the symbol exemption removed, and nothing else changed. */
type UnexemptedGuard<S> = Record<Exclude<keyof S, keyof ValidateSchemas>, never>

declare function unexempted<
  const F extends readonly ValidationFragment[],
>(options: { [I in keyof F]: F[I] & UnexemptedGuard<F[I]> }): void

/**
 * Without the exemption a set *name* reads as a stray key, so `defineValidation`'s
 * named form becomes unusable - the whole named surface, rejected. Inside a
 * function, never called: vitest runs this file as well as compiling it.
 */
export function withoutTheExemptionEveryNamedSetIsRejected(): void {
  // @ts-expect-error - "Types of property '[VALIDATION_NAME]' are incompatible"
  unexempted([...pagination])
}

// ---------------------------------------------------------------------------
// `NotAGroup`, on the flat overload: a malformed group cannot fall through to
// the flat form and be accepted there.
// ---------------------------------------------------------------------------

// @ts-expect-error - a malformed array cannot fall through to the flat form
defineValidatedEventHandler([{ qeury: pageQuery }], () => 'x')

/** The signature pair with the array overload left bare - the failed variant. */
interface FlatGuardedOnly {
  <
    const F extends readonly ValidationFragment[],
    R extends EventHandlerResponse,
  >(
    options: F,
    handler: (
      event: H3Event<EventHandlerRequest>,
      validated: MergedContext<F>
    ) => R
  ): R
  <S extends ValidateSchemas, R extends EventHandlerResponse>(
    options: S & OnlyValidationSources<S>,
    handler: (
      event: H3Event<EventHandlerRequest>,
      validated: ValidatedContext<S>
    ) => R
  ): R
}

declare const flatGuardedOnly: FlatGuardedOnly

/**
 * Guarding only the flat overload is strictly *worse than the hole*: the
 * malformed array is swallowed as a flat declaration and the handler is handed
 * the widened floor - four sources of `unknown`, none of them validated.
 */
export function withoutNotAGroupAMalformedArrayIsSwallowed(): void {
  flatGuardedOnly([{ qeury: pageQuery }], (event, _validated) => {
    type _swallowed = Expect<
      Equal<typeof _validated, ValidatedContext<ValidateSchemas>>
    >

    return null
  })
}

// ---------------------------------------------------------------------------
// The array parameter is a HOMOMORPHIC MAPPED TYPE, not a root intersection.
// (The runtime keeps its own declaration-time guard for the object spread, for
// the callers the types never see.)
// ---------------------------------------------------------------------------

const spreadTrap = { ...pagination, ...sorting }

/**
 * Inside a function, never called: the object-spread trap is refused by the
 * runtime as well - a declaration-time throw when the route file is evaluated -
 * and vitest runs this file as well as compiling it.
 */
export function theObjectSpreadTrapIsRejected(): void {
  // @ts-expect-error - `{ ...a, ...b }` is not how groups compose; `[...a, ...b]` is
  defineValidatedEventHandler(spreadTrap, () => 'x')
}

/**
 * The two candidate array parameters, as single signatures - which is what
 * isolates the claim. On the shipped wrapper the rejection is over-determined,
 * because `NotAGroup` on the overload below refuses a `length` too; here each
 * guard answers for itself.
 */
declare function mappedGuard<
  const F extends readonly ValidationFragment[],
>(options: { [I in keyof F]: F[I] & OnlyValidationSources<F[I]> }): void

declare function rootIntersected<const F extends readonly ValidationFragment[]>(
  options: F & { [I in keyof F]: OnlyValidationSources<F[I]> }
): void

/**
 * Both catch a stray key beside a valid one - the guard's own job - and only
 * the mapped form also refuses the object spread, whose `length` a mapped
 * parameter demands and an intersected one never looks at. The stray key has to
 * sit *beside* a valid one in both: alone it is caught by weak-type detection,
 * which is the mechanism this whole ticket exists because it is not enough.
 */
export function onlyTheMappedFormRejectsTheObjectSpread(): void {
  // @ts-expect-error - stray key, caught by the mapped guard
  mappedGuard([...pagination, { query: pageQuery, qeury: pageQuery }])

  // @ts-expect-error - stray key, caught by the root intersection too
  rootIntersected([...pagination, { query: pageQuery, qeury: pageQuery }])

  // @ts-expect-error - and this is the difference: `length` is not `never`
  mappedGuard(spreadTrap)

  rootIntersected(spreadTrap)
}

// ---------------------------------------------------------------------------
// A hand-written name marker is now a rejected stray key. The symbol is
// unspellable, so a set name can only be produced by `defineValidation` - and
// the literal someone might reach for instead no longer compiles at all.
// ---------------------------------------------------------------------------

// @ts-expect-error - `__validationName` is not a source, and not a name
defineValidatedEventHandler(
  { query: pageQuery, __validationName: 'forged' },
  () => 'x'
)

// ---------------------------------------------------------------------------
// Every legitimate shape is untouched - the guard adds rejection, not friction.
// ---------------------------------------------------------------------------

defineValidatedEventHandler(
  { query: pageQuery, body: userBody },
  (event, { query, body }) => {
    type _q = Expect<Equal<typeof query, { page: number; size: number }>>
    type _b = Expect<Equal<typeof body, { name: string }>>

    return { page: query.page, name: body.name }
  }
)

defineValidatedEventHandler(
  [...pagination, { body: userBody }],
  (event, { query: _query, body }) => {
    type _q = Expect<
      Equal<typeof _query.pagination, { page: number; size: number }>
    >
    type _b = Expect<Equal<typeof body, { name: string }>>

    return body.name
  }
)

/** A group used alone, without spreading, still needs no array ceremony. */
defineValidatedEventHandler(pagination, (event, { query }) => query.pagination)

/**
 * Declarations reaching the wrapper widened keep the honest `unknown` floor.
 *
 * The floor itself is pinned in the two surface suites; it is re-asserted here
 * because a guard is exactly the kind of thing that could refuse a widened
 * declaration outright - `OnlyValidationSources<ValidateSchemas>` has to come
 * out empty, not `never`-typed.
 */
declare const widenedSchemas: ValidateSchemas
declare const widenedGroup: ValidateSchemas[]

export function widenedDeclarationsStillPassTheGuard(): void {
  defineValidatedEventHandler(widenedSchemas, (event, _validated) => {
    type _q = Expect<Equal<(typeof _validated)['query'], unknown>>

    return null
  })

  defineValidatedEventHandler(widenedGroup, (event, _validated) => {
    type _q = Expect<Equal<(typeof _validated)['query'], unknown>>

    return null
  })
}

/** Keeps the file in vitest's inventory. */
describe('the source-key guard', () => {
  it('is asserted by the compiler, not by this suite', () => {
    expect(defineValidatedEventHandler).toBeTypeOf('function')
  })
})
