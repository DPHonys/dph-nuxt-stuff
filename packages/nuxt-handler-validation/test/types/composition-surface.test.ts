import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineValidatedEventHandler } from '../../src/runtime/server'
import type { Assert, Equal } from './assert'

/**
 * The reuse story, ported from the sandbox's `src/sandbox/reuse.ts`. There is
 * no definer: a reusable validation is a schema value - a plain export with no
 * source keys to misspell - and composition is a tuple on the source it
 * targets. Cross-library composition falls out for free, because the tuple's
 * elements are independent Standard Schemas.
 *
 * **Compiled, never run**, for the reason `handler-surface.test.ts` states.
 */

// --- "server/validation/listing.ts" - reusable units are schema values ----

const pagination = z.object({
  page: z.coerce.number(),
  size: z.coerce.number(),
})

// A different library on purpose: the contract is only Standard Schema.
const sorting = v.object({
  sort: v.picklist(['asc', 'desc']),
})

const profileBody = z.object({ name: z.string() })

// --- "server/api/users/index.get.ts" - composition is a tuple per source --

export function composedQuery(): void {
  defineValidatedEventHandler(
    { validate: { query: [pagination, sorting], body: profileBody } },
    async (_event, { query, body }) => {
      // Each element parsed the whole raw source; the delivered value is the
      // merge of their outputs, flat - ?page=1&size=20&sort=asc on the wire.
      type _page = Assert<Equal<typeof query.page, number>>
      type _size = Assert<Equal<typeof query.size, number>>
      type _sort = Assert<Equal<typeof query.sort, 'asc' | 'desc'>>
      type _body = Assert<Equal<typeof body, { name: string }>>

      // Flat is the *type*, not just the reading: one record of every merged
      // key, which is what a hover prints and what a declared return type has
      // to be spelled as. An intersection of the elements' outputs would carry
      // the same keys and fail this assertion.
      type _flat = Assert<
        Equal<
          typeof query,
          { page: number; size: number; sort: 'asc' | 'desc' }
        >
      >

      // The merged value satisfies each part whole, so a helper typed off one
      // reused schema's output takes it directly.
      const forHelper: { page: number; size: number } = query
      return { ...forHelper, name: body.name }
    }
  )
}

// --- A set spanning several sources is an object of schema values ---------

// v1 needed named sets for this; now it is just a module-level object, and
// the route says which slot each schema fills - explicit, no machinery.
const auth = {
  headers: z.object({ authorization: z.string() }),
  query: z.object({ tenant: z.string() }),
}

export function multiSourceSet(): void {
  defineValidatedEventHandler(
    {
      validate: {
        headers: auth.headers,
        query: [auth.query, pagination],
      },
    },
    async (_event, { headers, query }) => {
      type _auth = Assert<Equal<typeof headers, { authorization: string }>>
      type _tenant = Assert<Equal<typeof query.tenant, string>>
      type _page = Assert<Equal<typeof query.page, number>>
      return { tenant: query.tenant, authorized: headers.authorization !== '' }
    }
  )
}

// --- A single-element tuple is a lone schema, not a merge -----------------

export function singleElementTuple(): void {
  defineValidatedEventHandler(
    { validate: { query: [pagination] } },
    async (_event, { query }) => {
      type _same = Assert<Equal<typeof query, { page: number; size: number }>>
      return query
    }
  )
}

// --- An interface-typed output composes -----------------------------------

// The object test is structural, so a schema typed off an interface - here a
// third-party type reaching the tuple through `z.custom` - is not falsely
// refused for lacking an implicit index signature.
interface Filters {
  tag: string
}

const filters = z.custom<Filters>()

export function interfaceTypedOutput(): void {
  defineValidatedEventHandler(
    { validate: { query: [pagination, filters] } },
    async (_event, { query }) => {
      type _tag = Assert<Equal<typeof query.tag, string>>
      return query.tag
    }
  )
}

// --- A union output stays a union through the merge ------------------------

// Flattening distributes, so a schema outputting a union of objects merges
// branch by branch. The runtime hands back whichever branch matched, never the
// branches' merge - and a distributed union is what `kind` can narrow.
export function unionElement(): void {
  defineValidatedEventHandler(
    {
      validate: {
        query: [
          z.union([
            z.object({ kind: z.literal('a'), a: z.coerce.number() }),
            z.object({ kind: z.literal('b'), b: z.string() }),
          ]),
          sorting,
        ],
      },
    },
    async (_event, { query }) => {
      type _branches = Assert<
        Equal<
          typeof query,
          | { kind: 'a'; a: number; sort: 'asc' | 'desc' }
          | { kind: 'b'; b: string; sort: 'asc' | 'desc' }
        >
      >
      if (query.kind === 'a') {
        type _narrowed = Assert<Equal<typeof query.a, number>>
      }
      return query.sort
    }
  )
}

// --- An index-signature output composes ------------------------------------

// A passthrough or record output names no keys the compiler can compare - an
// index signature widens `keyof` to `string`, taking the named keys with it -
// so the overlap rule has nothing to prove and does not refuse the merge. The
// runtime's later-wins spread is what stands behind the keys it cannot see.
export function passthroughOutput(): void {
  defineValidatedEventHandler(
    {
      validate: {
        query: [z.looseObject({ page: z.coerce.number() }), sorting],
      },
    },
    async (_event, { query }) => {
      type _sort = Assert<Equal<typeof query.sort, 'asc' | 'desc'>>
      // Such a merge is the one that stays an intersection rather than being
      // restated flat: `keyof` is the whole key space here, so a flat restating
      // would have nothing to name `page` with and would hand back the index
      // signature alone. The named key survives instead.
      type _page = Assert<Equal<typeof query.page, number>>
      return query.page
    }
  )
}

export function recordOutput(): void {
  defineValidatedEventHandler(
    { validate: { query: [z.record(z.string(), z.unknown()), sorting] } },
    async (_event, { query }) => {
      type _sort = Assert<Equal<typeof query.sort, 'asc' | 'desc'>>
      return query.sort
    }
  )
}

// --- An `any`-typed schema composes ----------------------------------------

// Decision 6 names an `any`-typed schema as a case the *runtime* merge exists
// to handle, so the declaration guard may not refuse it: `any` satisfies both
// branches of every conditional, and answering it before the object test is
// what keeps that runtime path reachable from typed code.
declare const untypedSchema: any

export function anyTypedElement(): void {
  defineValidatedEventHandler(
    { validate: { query: [pagination, untypedSchema] } },
    async (_event, { query }) => {
      // The merge is `any`, which is the honest report rather than a defect of
      // this fixture: an element that promises nothing takes the whole slot's
      // type with it, and the runtime's later-wins spread is what runs.
      type _merged = Assert<Equal<typeof query, any>>
      return query.page
    }
  )
}

/** Keeps the file in vitest's inventory. */
describe('the composition surface', () => {
  it('is asserted by the compiler, not by this suite', () => {
    expect(defineValidatedEventHandler).toBeTypeOf('function')
  })
})
