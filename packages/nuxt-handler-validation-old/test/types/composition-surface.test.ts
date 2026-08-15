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
  ValidationSource,
} from '../../src/runtime/types'
import type {
  CompositionError,
  MergedContext,
} from '../../src/runtime/types/composition'

/**
 * The composed declaration's compile-time contract, asserted by the compiler
 * under `pnpm typecheck`. Ported from the typing prototype's
 * `probe-array-groups.ts` - the verified reference implementation of this
 * machinery - rather than re-derived.
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
 * The blind spot, on record: two fragments that are mutually assignable are
 * indistinguishable from one, so no second contribution is visible and the
 * merge passes. Deliberate - that is exactly the case where the merged answer
 * tells the truth (`A & A = A`), so the type never lies. The runtime, which
 * counts real fragments and merges real values, has no such blind spot.
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

// ---------------------------------------------------------------------------
// A NAMED set nests its output under its name - uniformly, so a route's shape
// does not change when another set joins it. `query.pagination` is EXACTLY the
// pagination schema's output: passable whole to a helper typed off the same
// schema, with no other set's keys riding along.
// ---------------------------------------------------------------------------

const namedPagination = defineValidation('pagination', { query: pageQuery })
const namedSorting = defineValidation('sorting', {
  query: z.object({ sort: z.enum(['asc', 'desc']) }),
})

/**
 * The only way to name a set's output type today - library-specific, and
 * indexing into the group tuple. The design spec records this as a known
 * ergonomic gap and deliberately leaves it unsolved; this line is what the gap
 * costs, written out.
 */
const paginate = (p: z.output<(typeof namedPagination)[0]['query']>): number =>
  p.page

export const namedAndInline = defineValidatedEventHandler(
  [...namedPagination, ...namedSorting, { body: userBody }],
  (event, { query, body }) => {
    type _keys = Expect<Equal<keyof typeof query, 'pagination' | 'sorting'>>
    type _qp = Expect<
      Equal<typeof query.pagination, { page: number; size: number }>
    >
    type _qs = Expect<Equal<typeof query.sorting, { sort: 'asc' | 'desc' }>>
    type _b = Expect<Equal<typeof body, { name: string; tags: string[] }>>

    return { page: paginate(query.pagination), tags: body.tags }
  }
)

/** Alone, the same set nests exactly as it does composed. */
defineValidatedEventHandler(namedPagination, (event, { query }) => {
  type _q = Expect<
    Equal<typeof query, { pagination: { page: number; size: number } }>
  >

  return query.pagination.page
})

/** A named set and an unnamed one on one source: nested beside flat. */
defineValidatedEventHandler(
  [...namedPagination, ...filter],
  (event, { query }) => {
    type _q = Expect<
      Equal<
        typeof query,
        { filter?: string | undefined } & {
          pagination: { page: number; size: number }
        }
      >
    >

    return query.filter ?? String(query.pagination.page)
  }
)

/** Names survive the loss of tuple structure, like everything else here. */
const namedListQuery = [...namedPagination, ...namedSorting]

defineValidatedEventHandler(namedListQuery, (event, { query }) => {
  type _qp = Expect<
    Equal<typeof query.pagination, { page: number; size: number }>
  >
  type _qs = Expect<Equal<typeof query.sorting, { sort: 'asc' | 'desc' }>>

  return query.sorting.sort
})

// ---------------------------------------------------------------------------
// The name namespaces EVERY source the set declares, not just one - the name
// is the set's namespace, uniformly.
// ---------------------------------------------------------------------------

const auth = defineValidation('auth', {
  headers: v.object({ authorization: v.string() }),
  query: v.object({ token: v.optional(v.string()) }),
})

defineValidatedEventHandler(
  [...auth, ...namedPagination],
  (event, { query: _query, headers }) => {
    type _h = Expect<Equal<typeof headers, { auth: { authorization: string } }>>
    type _keys = Expect<Equal<keyof typeof _query, 'auth' | 'pagination'>>
    type _qa = Expect<Equal<typeof _query.auth, { token?: string | undefined }>>

    return headers.auth.authorization
  }
)

// ---------------------------------------------------------------------------
// Poison: two DIFFERENT sets sharing one name on one source. The granularity
// is the point - only that name's value is poisoned, and the source's other
// keys stay usable.
// ---------------------------------------------------------------------------

const paginationImpostor = defineValidation('pagination', {
  query: z.object({ cursor: z.string() }),
})

/**
 * Inside a function, never called: this declaration is refused by the *runtime*
 * too - the duplicate name throws when the route file is evaluated - and the
 * `types` project runs these files as well as compiling them. Both guards
 * firing on one declaration is the design, not a conflict.
 */
export function twoSetsSharingOneName(): void {
  defineValidatedEventHandler(
    [...namedPagination, ...paginationImpostor, ...namedSorting, ...flags],
    (event, { query }) => {
      type _poisoned = Expect<
        Equal<
          typeof query.pagination,
          CompositionError<'two different sets share one name on this source'>
        >
      >

      // @ts-expect-error - the poisoned name is not usable as either output
      const page: number = query.pagination.page

      // The rest of the source is untouched - another set's name AND an
      // unnamed fragment's flat key. One ambiguous slot does not cost the
      // author everything else on that source, which is the whole difference
      // between this poison and the name-vs-key one below.
      type _otherName = Expect<
        Equal<typeof query.sorting, { sort: 'asc' | 'desc' }>
      >
      type _unnamedKey = Expect<Equal<typeof query.archived, boolean>>

      return page
    }
  )
}

// ---------------------------------------------------------------------------
// Poison: a set name colliding with an unnamed fragment's output key. This one
// poisons the WHOLE source - the collision is between the two layers, and
// neither is the obvious loser.
// ---------------------------------------------------------------------------

const sneaky = defineValidation({ query: z.object({ pagination: z.string() }) })

defineValidatedEventHandler(
  [...namedPagination, ...sneaky],
  (event, { query: _query }) => {
    type _poisoned = Expect<
      Equal<
        typeof _query,
        CompositionError<'a set name collides with an unnamed schema output key on this source'>
      >
    >

    return null
  }
)

// ---------------------------------------------------------------------------
// Poison: a non-object unnamed output beside a named set. There is nothing for
// the named layer to sit beside.
// ---------------------------------------------------------------------------

defineValidatedEventHandler(
  [...namedPagination, ...numericQuery],
  (event, { query: _query }) => {
    type _poisoned = Expect<
      Equal<
        typeof _query,
        CompositionError<'unnamed schemas composed beside named sets must output plain objects'>
      >
    >

    return null
  }
)

/**
 * The overlap poison fires in the mixed branch too, and is returned BARE -
 * never intersected with the named part - so the diagnostic prints that
 * sentence alone rather than as one half of an intersection.
 */
defineValidatedEventHandler(
  [...namedPagination, ...filter, ...filterAsNumber],
  (event, { query: _query }) => {
    type _poisoned = Expect<
      Equal<
        typeof _query,
        CompositionError<'two unnamed sets contribute the same output key to one source — name one of them'>
      >
    >

    return null
  }
)

// ---------------------------------------------------------------------------
// The merge's arity is read from the FRAGMENTS that declare a source, never
// from the shape of what they output. A lone schema whose output happens to be
// a union is one contribution, not a collision.
// ---------------------------------------------------------------------------

const eitherQuery = defineValidation({
  query: z.union([z.string(), z.coerce.number()]),
})

defineValidatedEventHandler(eitherQuery, (event, { query }) => {
  type _q = Expect<Equal<typeof query, string | number>>

  return query
})

const eitherShape = defineValidation({
  query: z.union([
    z.object({ page: z.coerce.number() }),
    z.object({ cursor: z.string() }),
  ]),
})

defineValidatedEventHandler(eitherShape, (event, { query }) => {
  // The runtime hands back whichever branch matched, so the union is what the
  // handler really receives - intersecting the branches would be a lie.
  type _q = Expect<Equal<typeof query, { page: number } | { cursor: string }>>

  return query
})

// ---------------------------------------------------------------------------
// The name marker is a `unique symbol`, so it is not a source key and cannot
// reach the delivered context or the phantom - both are masked to the four
// sources. A name can only be produced by `defineValidation`'s named form.
// ---------------------------------------------------------------------------

export type AssertNoSourceKeyIsASymbol = Expect<
  Equal<Extract<ValidationSource, symbol>, never>
>

/**
 * A hand-written marker is an ordinary property and never a set name, so the
 * source it declares still arrives flat. The symbol is unspellable, which is
 * what makes this a property of the design rather than of a naming convention;
 * rejecting the stray key outright is the source-key guard's job.
 */
export type AssertAForgedNameIsJustAKey = Expect<
  Equal<
    MergedContext<[{ __validationName: 'forged'; query: typeof pageQuery }]>,
    { query: { page: number; size: number } }
  >
>

// ---------------------------------------------------------------------------
// The phantom under composition carries the per-source schema union with NAMES
// STRIPPED: namespacing is output-only, so a named set's schema appears here
// exactly as an unnamed one's does and the raw input stays flat.
// ---------------------------------------------------------------------------

type NamedSchemas = SchemasOfHandler<typeof namedAndInline>

export type AssertNamedPhantomKeysAreSourcesOnly = Expect<
  Equal<keyof NamedSchemas, 'query' | 'body'>
>

export type AssertNamedPhantomStripsNames = Expect<
  Equal<
    NamedSchemas['query'],
    | typeof pageQuery
    | z.ZodObject<{ sort: z.ZodEnum<{ asc: 'asc'; desc: 'desc' }> }>
  >
>

/** Keeps the file in vitest's inventory. */
describe('the composed declaration surface', () => {
  it('is asserted by the compiler, not by this suite', () => {
    expect(listUsers).toBeTypeOf('function')
  })
})
