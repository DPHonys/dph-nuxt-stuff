import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { EventHandler, EventHandlerRequest } from 'h3'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  defineValidation,
  defineValidatedEventHandler,
} from '../../src/runtime/server'
import type {
  SchemasOfHandler,
  ValidateSchemas,
  ValidationFragment,
  ValidationGroup,
} from '../../src/runtime/types'
import type { CompositionError } from '../../src/runtime/types/composition'

/**
 * The composed declaration's compile-time contract, asserted by the compiler
 * under `pnpm typecheck`. Ported from the typing prototype's
 * `probe-array-groups.ts` - the verified reference implementation of this
 * machinery - rather than re-derived, minus the named-set cases, which arrive
 * with the names themselves.
 *
 * The suite at the bottom only keeps the file in vitest's inventory.
 */

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false

type Expect<T extends true> = T

const pageQuery = z.object({ page: z.coerce.number(), size: z.coerce.number() })
const userBody = z.object({
  name: z.string(),
  tags: z.string().transform((s) => s.split(',')),
})

const pagination = defineValidation({ query: pageQuery })
const filter = defineValidation({
  query: v.object({ filter: v.optional(v.string()) }),
})
const flags = defineValidation({ query: z.object({ archived: z.boolean() }) })

// ---------------------------------------------------------------------------
// What the definer hands back: one fragment in a readonly tuple, its schemas'
// exact types intact - which is what makes a set reusable at full inference.
// ---------------------------------------------------------------------------

export type AssertGroupIsAOneElementTuple = Expect<
  Equal<
    typeof pagination,
    ValidationGroup<{ readonly query: typeof pageQuery }>
  >
>

export type AssertGroupHoldsAFragment = Expect<
  (typeof pagination)[0] extends ValidationFragment ? true : false
>

// ---------------------------------------------------------------------------
// A single group needs no array ceremony, and its unnamed output arrives flat
// - exactly as the same schemas written inline would.
// ---------------------------------------------------------------------------

defineValidatedEventHandler(pagination, (event, { query }) => {
  type _q = Expect<Equal<typeof query, { page: number; size: number }>>

  return query.page
})

// ---------------------------------------------------------------------------
// Unnamed fragments with disjoint keys merge flat, and the merged value stays
// usable where one fragment's own output is expected.
// ---------------------------------------------------------------------------

/** A helper typed off one fragment's schema output alone. */
const useFlags = (q: { archived: boolean }): boolean => q.archived

defineValidatedEventHandler([...filter, ...flags], (event, { query }) => {
  type _q = Expect<
    Equal<typeof query, { filter?: string | undefined } & { archived: boolean }>
  >

  return useFlags(query)
})

// ---------------------------------------------------------------------------
// Inline fragments mix freely with spread groups, and every source any
// fragment declares appears - no more.
// ---------------------------------------------------------------------------

const listUsers = defineValidatedEventHandler(
  [...pagination, { body: userBody }],
  async (event, { query, body }) => {
    type _keys = Expect<Equal<keyof typeof query, 'page' | 'size'>>
    type _b = Expect<Equal<typeof body, { name: string; tags: string[] }>>

    return { page: query.page, tags: body.tags }
  }
)

// ---------------------------------------------------------------------------
// The merged context is computed from the fragment array's ELEMENT UNION, so a
// group composed into a plain array - no `as const`, no tuple structure left -
// still infers every source in full.
// ---------------------------------------------------------------------------

const listQuery = [...filter, ...flags]

export type AssertComposedArrayLosesItsTuple = Expect<
  Equal<typeof listQuery, Array<(typeof filter)[0] | (typeof flags)[0]>>
>

defineValidatedEventHandler(listQuery, (event, { query }) => {
  type _q = Expect<
    Equal<typeof query, { filter?: string | undefined } & { archived: boolean }>
  >

  return query.archived
})

// ---------------------------------------------------------------------------
// Poison: two unnamed fragments contributing the SAME output key to one
// source. This was the one collision silent at both levels - typed as the
// intersection (`string & number` = `never`), delivered as the last fragment's
// value.
// ---------------------------------------------------------------------------

const filterAsNumber = defineValidation({
  query: z.object({ filter: z.coerce.number() }),
})

defineValidatedEventHandler(
  [...filter, ...filterAsNumber],
  (event, { query }) => {
    type _poisoned = Expect<
      Equal<
        typeof query,
        CompositionError<'two unnamed sets contribute the same output key to one source — name one of them'>
      >
    >

    // @ts-expect-error - was `string & number` = never; now it says why
    const overlapping: string = query.filter

    return overlapping
  }
)

/**
 * The blind spot, on record: two fragments whose whole output types are
 * identical collapse into one union member before the pairwise comparison
 * runs, so no overlap is visible and the merge passes. Deliberate - that is
 * exactly the case where the intersection tells the truth (`A & A = A`), so
 * the type never lies. The runtime, which counts fragments and merges real
 * values, has no such blind spot.
 */
const filterAgain = defineValidation({
  query: v.object({ filter: v.optional(v.string()) }),
})

defineValidatedEventHandler([...filter, ...filterAgain], (event, { query }) => {
  // Not `Equal`: the two identical outputs survive as a two-member union, and
  // what matters is that it does not LIE - it is mutually assignable with the
  // honest single output, where the conflicting case above is poisoned.
  const asOne: { filter?: string | undefined } = query
  const andBack: typeof query = asOne

  return andBack.filter
})

// ---------------------------------------------------------------------------
// Poison: colliding unnamed outputs that are not all plain objects. There is
// no honest merge of a number into an object, so the type refuses one.
// ---------------------------------------------------------------------------

const numericQuery = defineValidation({
  query: z.string().transform(Number),
})

defineValidatedEventHandler(
  [...numericQuery, ...filter],
  (event, { query: _query }) => {
    type _poisoned = Expect<
      Equal<
        typeof _query,
        CompositionError<'colliding unnamed schemas for one source must all output plain objects'>
      >
    >

    return null
  }
)

/** A LONE non-object output is fine - there is nothing to merge it into. */
defineValidatedEventHandler(numericQuery, (event, { query }) => {
  type _q = Expect<Equal<typeof query, number>>

  return query
})

// ---------------------------------------------------------------------------
// The return type still flows to Nitro's typed routes through the array form,
// and the handler is still an ordinary h3 one.
// ---------------------------------------------------------------------------

type ResponseOf<T> =
  T extends EventHandler<EventHandlerRequest, infer R> ? R : never

export type AssertComposedResponseFlowsToNitro = Expect<
  Equal<Awaited<ResponseOf<typeof listUsers>>, { page: number; tags: string[] }>
>

export const composedAsVanilla: EventHandler = listUsers

// ---------------------------------------------------------------------------
// The phantom under composition: the per-source schema UNION, recording which
// schemas that source must satisfy. A union is not what a client must send -
// every fragment parses the whole raw source, so the required input is the
// INTERSECTION of the members' inputs, which is the aggregator's arithmetic.
// ---------------------------------------------------------------------------

const _listSchemas = defineValidatedEventHandler(
  [...pagination, ...flags, { body: userBody }],
  () => 'ok'
)

type ListSchemas = SchemasOfHandler<typeof _listSchemas>

export type AssertPhantomKeys = Expect<
  Equal<keyof ListSchemas, 'query' | 'body'>
>

export type AssertPhantomCarriesEverySchemaForASource = Expect<
  Equal<
    ListSchemas['query'],
    typeof pageQuery | z.ZodObject<{ archived: z.ZodBoolean }>
  >
>

// ---------------------------------------------------------------------------
// Misuse inside the array form still errors at the offending element.
// ---------------------------------------------------------------------------

// @ts-expect-error - a typo'd source key inside a fragment is rejected
defineValidatedEventHandler([...pagination, { qeury: userBody }], () => 'x')

// @ts-expect-error - a non-schema value in a fragment's source slot
defineValidatedEventHandler([{ query: 42 }], () => 'x')

// ---------------------------------------------------------------------------
// The annotation hazard's floor: fragments reaching the wrapper through the
// widened `ValidateSchemas` annotation degrade every source to `unknown` - the
// honest floor, never `never`. Inside a function, never called: `widenedGroup`
// is declared, not defined, and vitest runs this file as well as compiling it.
// ---------------------------------------------------------------------------

declare const widenedGroup: ValidateSchemas[]

export function widenedFragmentsDegradeToUnknown(): void {
  defineValidatedEventHandler(widenedGroup, (event, _validated) => {
    type _keys = Expect<
      Equal<
        keyof typeof _validated,
        'routerParams' | 'query' | 'headers' | 'body'
      >
    >
    type _q = Expect<Equal<(typeof _validated)['query'], unknown>>

    return null
  })
}

// ---------------------------------------------------------------------------
// A schema widened to bare `StandardSchemaV1` infers `unknown` here too - a
// Standard Schema limitation (`types` is optional), documented, not fought.
// ---------------------------------------------------------------------------

declare const widened: StandardSchemaV1

export function widenedSchemaInAFragmentDegradesToUnknown(): void {
  defineValidatedEventHandler([{ query: widened }], (event, { query }) => {
    type _q = Expect<Equal<typeof query, unknown>>

    return query
  })
}

/** Keeps the file in vitest's inventory. */
describe('the composed declaration surface', () => {
  it('is asserted by the compiler, not by this suite', () => {
    expect(listUsers).toBeTypeOf('function')
  })
})
