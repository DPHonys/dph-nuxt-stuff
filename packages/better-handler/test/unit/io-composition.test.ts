import { request, requestReporting, wire } from '@dphonys/test-utils/h3-app'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  defineBetterEventHandler,
  recognizeKnownError,
} from '../../src/runtime/server'
import type { JsonValue } from '../../src/runtime/server/io/sources'
import { schemaReturning, validationFailedBodyOf } from './io-support'

// A source composed from a tuple of schemas, driven through a real h3 app:
// every element parses the whole raw source, their issues arrive together,
// and their outputs merge into the one value the Handler receives.

/** Two units of reuse, from a different library each on purpose. */
const pagination = z.object({
  page: z.coerce.number(),
  size: z.coerce.number(),
})

const sorting = v.object({ sort: v.picklist(['asc', 'desc']) })

/** A query both units reject: a bad `page`, a missing `size`, a bad `sort`. */
const SPOILED = '/api/test?page=x&sort=sideways'

/** What the schemas below hand back: JSON, or the one exotic object tested. */
type Produced = JsonValue | Date

/**
 * A schema producing whatever `produce` hands back, under an output type of
 * the caller's choosing. The gap between the two is the point: `v.custom` is
 * how a library lets an author claim an output it does not check, which
 * stands in for the untyped schema a suite cannot otherwise write. valibot
 * rather than zod, whose Standard Schema door runs an async pipeline twice,
 * which would double every side effect.
 */
function schemaOutputting<Output>(
  produce: () => Produced | Promise<Produced>
): StandardSchemaV1<unknown, Output> {
  return v.pipeAsync(
    v.unknown(),
    v.transformAsync(async () => produce()),
    v.custom<Output>(() => true)
  )
}

/** What a validation failure said, as `source:path` per issue. */
async function issuesOf(response: Response): Promise<string[]> {
  const { data } = await validationFailedBodyOf(response)

  return data.issues.map(({ source, path }) => `${source}:${path.join('.')}`)
}

describe('a source composed from a tuple', () => {
  it('validates every element against the raw source and merges their outputs', async () => {
    const route = defineBetterEventHandler(
      { input: { query: [pagination, sorting] } },
      (_event, { query }) => ({
        page: query.page,
        size: query.size,
        sort: query.sort,
      })
    )

    const response = await request(route, '/api/test?page=1&size=20&sort=asc')

    // The client sends one flat query string, and both elements parse it all.
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ page: 1, size: 20, sort: 'asc' })
  })

  it('runs every element after a failing one, so every issue arrives together', async () => {
    const route = defineBetterEventHandler(
      { input: { query: [pagination, sorting] } },
      () => 'the Handler never runs'
    )

    const response = await request(route, SPOILED)

    // Fail-fast is a rule across sources only.
    expect(response.status).toBe(400)
    expect(await issuesOf(response)).toEqual([
      'query:page',
      'query:size',
      'query:sort',
    ])
  })

  it('reports the same issues whichever order the tuple is written in', async () => {
    const written = defineBetterEventHandler(
      { input: { query: [pagination, sorting] } },
      () => 'the Handler never runs'
    )
    const reordered = defineBetterEventHandler(
      { input: { query: [sorting, pagination] } },
      () => 'the Handler never runs'
    )

    // A set: the order follows the tuple, and only the set is promised.
    expect(
      (await issuesOf(await request(reordered, SPOILED))).toSorted()
    ).toEqual((await issuesOf(await request(written, SPOILED))).toSorted())
  })
})

describe('the merge of a tuple’s outputs', () => {
  it('is later-wins for the keys the declaration could not see', async () => {
    // Disjoint to the compiler, overlapping at runtime, so the guard has
    // nothing to refuse and the merge itself is the rule.
    const first = schemaOutputting<{ page: number }>(() => ({
      page: 1,
      shared: 'first',
    }))
    const second = schemaOutputting<{ size: number }>(() => ({
      size: 2,
      shared: 'second',
    }))

    const written = defineBetterEventHandler(
      { input: { query: [first, second] } },
      (_event, { query }) => ({ ...query })
    )
    const reordered = defineBetterEventHandler(
      { input: { query: [second, first] } },
      (_event, { query }) => ({ ...query })
    )

    expect(await (await request(written, '/api/test')).json()).toEqual({
      page: 1,
      size: 2,
      shared: 'second',
    })
    expect(await (await request(reordered, '/api/test')).json()).toEqual({
      page: 1,
      size: 2,
      shared: 'first',
    })
  })

  it('leaves the merged object’s prototype alone, whatever the keys', async () => {
    // `JSON.parse` keeps `__proto__` as an own key, where an assignment onto a
    // plain object would call the setter that swaps the prototype.
    const polluting = schemaOutputting<{ page: number }>(() =>
      wire('{"page":1,"__proto__":{"admin":true}}')
    )
    const benign = schemaOutputting<{ size: number }>(() => ({ size: 2 }))

    const route = defineBetterEventHandler(
      { input: { query: [polluting, benign] } },
      (_event, { query }) => ({
        // `in` walks the prototype chain, where a swapped one would show.
        inherited: 'admin' in query ? query.admin : null,
        ownPrototype: Object.getPrototypeOf(query) === Object.prototype,
      })
    )

    expect(await (await request(route, '/api/test')).json()).toEqual({
      inherited: null,
      ownPrototype: true,
    })
  })

  it('takes a null-prototype output, as h3’s form body is', async () => {
    const formLike = schemaOutputting<{ page: string }>(() =>
      Object.assign(Object.create(null), { page: '1' })
    )

    const route = defineBetterEventHandler(
      { input: { query: [formLike, sorting] } },
      (_event, { query }) => ({ ...query })
    )

    const response = await request(route, '/api/test?sort=asc')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ page: '1', sort: 'asc' })
  })

  it('runs async elements one after another, in tuple order', async () => {
    const order: string[] = []

    const slow = schemaOutputting<{ slow: true }>(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      order.push('slow')

      return { slow: true }
    })
    const quick = schemaOutputting<{ quick: true }>(() => {
      order.push('quick')

      return { quick: true }
    })

    const route = defineBetterEventHandler(
      { input: { query: [slow, quick] } },
      (_event, { query }) => ({ ...query })
    )

    const response = await request(route, '/api/test')

    // Under `Promise.all` the quick element would finish first.
    expect(response.status).toBe(200)
    expect(order).toEqual(['slow', 'quick'])
  })
})

describe('an element output the merge cannot take', () => {
  it('is a plain 500 naming the route, the source and the element', async () => {
    const route = defineBetterEventHandler(
      {
        input: {
          query: [
            schemaOutputting<{ page: number }>(() => ({ page: 1 })),
            schemaOutputting<{ tag: string }>(() => 'not an object at all'),
          ],
        },
      },
      () => 'the Handler never runs'
    )

    const { response, thrown } = await requestReporting(route, '/api/test', {
      route: '/api/test',
    })

    expect(response.status).toBe(500)
    expect(thrown.message).toBe(
      '[better-handler] cannot merge the validated query of GET /api/test: the schema at index 1 produced the primitive not an object at all. ' +
        'Schemas composed on one source merge their outputs, so every element of the tuple must produce a plain object.'
    )
    // A bug in the route, not a client's bad input: never a Known error.
    expect(thrown.data).toBeUndefined()
    expect(recognizeKnownError(thrown)).toBeUndefined()
  })

  it('refuses an exotic object the compile guard let through', async () => {
    // A `Date` passes the structural compile-time test, and its meaning
    // lives outside its own enumerable keys, so a merge would drop it.
    const route = defineBetterEventHandler(
      {
        input: {
          query: [
            schemaOutputting<{ page: number }>(() => ({ page: 1 })),
            schemaOutputting<Date>(() => new Date()),
          ],
        },
      },
      () => 'the Handler never runs'
    )

    const { response, thrown } = await requestReporting(route, '/api/test')

    expect(response.status).toBe(500)
    expect(thrown.message).toContain(
      'the schema at index 1 produced an instance of Date.'
    )
  })
})

describe('an element that reports neither a value nor an issue', () => {
  const route = defineBetterEventHandler(
    {
      input: {
        query: [
          schemaOutputting<{ page: number }>(() => ({ page: 1 })),
          schemaReturning<{ tag: string }>({ issues: [] }),
        ],
      },
    },
    (_event, { query }) => ({ ...query })
  )

  it('is a plain 500 naming the element by its index', async () => {
    const { response, thrown } = await requestReporting(route, '/api/test', {
      route: '/api/test',
    })

    // Silent data loss - a 200 with the element missing from the merge - is
    // the one outcome the merge may never produce.
    expect(response.status).toBe(500)
    expect(thrown.message).toContain(
      'cannot validate the query of GET /api/test: the schema at index 1 reported a failure with no issues.'
    )
    expect(recognizeKnownError(thrown)).toBeUndefined()
  })

  it('does not pre-empt the issues its siblings did report', async () => {
    const quiet = defineBetterEventHandler(
      {
        input: {
          query: [schemaReturning<{ page: number }>({ issues: [] }), sorting],
        },
      },
      () => 'the Handler never runs'
    )

    const response = await request(quiet, SPOILED)

    // A real rejection is what the client hears about.
    expect(response.status).toBe(400)
    expect(await issuesOf(response)).toEqual(['query:sort'])
  })
})

describe('a lone element', () => {
  it('delivers exactly what a bare schema does', async () => {
    const schema = z.object({ page: z.coerce.number() })

    const bare = defineBetterEventHandler(
      { input: { query: schema } },
      (_event, { query }) => ({ page: query.page })
    )
    const tupled = defineBetterEventHandler(
      { input: { query: [schema] } },
      (_event, { query }) => ({ page: query.page })
    )

    expect(await (await request(tupled, '/api/test?page=2')).json()).toEqual(
      await (await request(bare, '/api/test?page=2')).json()
    )
  })

  it('passes its output through untouched, primitives and unions included', async () => {
    // Nothing to merge into, so nothing object-tests it.
    const pageOrAll = z.union([
      z.object({ page: z.string() }).transform(({ page }) => Number(page)),
      z.object({ all: z.literal('yes') }),
    ])

    const route = defineBetterEventHandler(
      { input: { query: [pageOrAll] } },
      (_event, { query }) => ({ query })
    )

    expect(await (await request(route, '/api/test?page=2')).json()).toEqual({
      query: 2,
    })
    expect(await (await request(route, '/api/test?all=yes')).json()).toEqual({
      query: { all: 'yes' },
    })
  })
})
