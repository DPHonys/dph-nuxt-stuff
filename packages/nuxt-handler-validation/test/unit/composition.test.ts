import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { EventHandler } from 'h3'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineValidatedEventHandler } from '../../src/runtime/server'
import { readValidationMarker } from '../../src/runtime/shared/error-marker'
import { request } from '../h3-app'

/**
 * The per-source tuple - v2's whole composition model - driven through the same
 * seam as every other runtime claim: a handler mounted in a real h3 app,
 * answering real requests. What a suite here asserts is what a client got back
 * or what the handler body was handed, never an internal shape.
 */

/** The reuse story's two units, from a different library each on purpose. */
const pagination = z.object({
  page: z.coerce.number(),
  size: z.coerce.number(),
})

const sorting = v.object({ sort: v.picklist(['asc', 'desc']) })

/**
 * A schema that accepts anything and produces whatever `produce` hands back,
 * under an output type of the caller's choosing.
 *
 * The gap between the two is the point: the runtime merge exists for the values
 * a declaration cannot describe - a key riding along that the type never
 * mentioned, an output that is an object to the compiler and something else at
 * request time - and this is the door to them, standing in for the `any`-typed
 * schema or plain-JS caller a suite cannot otherwise write.
 */
function schemaOutputting<Output>(
  produce: () => unknown
): StandardSchemaV1<unknown, Output> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: async () => ({ value: (await produce()) as Output }),
    },
  }
}

/** A query both units above reject: a bad `page`, a missing `size`, a bad `sort`. */
const SPOILED = '/api/test?page=x&sort=sideways'

/** What a failure answer said, flattened to `source:path` per issue. */
async function issuesOf(response: Response): Promise<string[]> {
  const body = (await response.json()) as {
    data: { issues: Array<{ source: string; path: unknown[] }> }
  }

  return body.data.issues.map(
    (issue) => `${issue.source}:${issue.path.join('.')}`
  )
}

/** The same, as a set - the part of the answer a tuple's order cannot change. */
async function sortedIssuesOf(response: Response): Promise<string[]> {
  return (await issuesOf(response)).toSorted()
}

/** The 500 a request produced, as the error object the process saw. */
async function errorFrom(
  handler: EventHandler
): Promise<{ status: number; error: unknown }> {
  let error: unknown

  const response = await request(handler, '/api/test', {
    onError: (thrown) => void (error = thrown),
  })

  return { status: response.status, error }
}

describe('a source composed from a tuple', () => {
  it('validates every element against the raw source and merges their outputs', async () => {
    const handler = defineValidatedEventHandler(
      { validate: { query: [pagination, sorting] } },
      (event, { query }) => ({
        page: query.page,
        size: query.size,
        sort: query.sort,
      })
    )

    const response = await request(handler, '/api/test?page=1&size=20&sort=asc')

    // The wire is untouched - the client sends one flat query string, and both
    // elements parse the whole of it. Cross-library composition falls out of
    // that: the contract is only the `~standard` interface.
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      page: 1,
      size: 20,
      sort: 'asc',
    })
  })
})

describe('a failing element of a tuple', () => {
  it('does not stop the elements after it - every issue arrives together', async () => {
    const handler = defineValidatedEventHandler(
      { validate: { query: [pagination, sorting] } },
      () => 'the body never runs'
    )

    const response = await request(handler, SPOILED)

    // The first element rejected `page` and never saw `size`; the second still
    // ran and rejected `sort`. Fail-fast is a rule across sources, never
    // between one source's elements.
    expect(response.status).toBe(400)
    expect(response.statusText).toBe('Validation Error')
    await expect(issuesOf(response)).resolves.toEqual([
      'query:page',
      'query:size',
      'query:sort',
    ])
  })

  it('reports the same issue set whichever order the tuple was written in', async () => {
    const written = await request(
      defineValidatedEventHandler(
        { validate: { query: [pagination, sorting] } },
        () => 'the body never runs'
      ),
      SPOILED
    )
    const reordered = await request(
      defineValidatedEventHandler(
        { validate: { query: [sorting, pagination] } },
        () => 'the body never runs'
      ),
      SPOILED
    )

    // Compared as a set, because the array order does follow the tuple - what a
    // client is promised is that the *set* does not, so reuse can be composed
    // in any order without changing what a request gets back.
    expect(reordered.status).toBe(written.status)
    await expect(sortedIssuesOf(reordered)).resolves.toEqual(
      await sortedIssuesOf(written)
    )
  })
})

describe('the merge of a tuple’s outputs', () => {
  it('is later-wins for the keys the declaration could not see', async () => {
    // Disjoint to the compiler, overlapping at runtime: exactly the blind spot
    // decision 6 names - a passthrough key, a plain-JS caller, an `any`-typed
    // schema. The declaration guard has nothing to refuse here, so the merge
    // itself is the rule, and it is a plain spread.
    const first = schemaOutputting<{ page: number }>(() => ({
      page: 1,
      shared: 'first',
    }))
    const second = schemaOutputting<{ size: number }>(() => ({
      size: 2,
      shared: 'second',
    }))

    const written = await request(
      defineValidatedEventHandler(
        { validate: { query: [first, second] } },
        (event, { query }) => ({ ...query })
      ),
      '/api/test'
    )
    const reordered = await request(
      defineValidatedEventHandler(
        { validate: { query: [second, first] } },
        (event, { query }) => ({ ...query })
      ),
      '/api/test'
    )

    await expect(written.json()).resolves.toEqual({
      page: 1,
      size: 2,
      shared: 'second',
    })
    await expect(reordered.json()).resolves.toEqual({
      page: 1,
      size: 2,
      shared: 'first',
    })
  })

  it('runs async elements sequentially, in tuple order', async () => {
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

    const handler = defineValidatedEventHandler(
      { validate: { query: [slow, quick] } },
      (event, { query }) => ({ ...query })
    )

    const response = await request(handler, '/api/test')

    // The observation is the side-effect order, because that is the only thing
    // a parallel run would change: under `Promise.all` the quick element
    // finishes first. Tuple order is the promise, so async schemas compose
    // predictably.
    expect(response.status).toBe(200)
    expect(order).toEqual(['slow', 'quick'])
  })
})

describe('an element output the merge cannot take', () => {
  it('is a 500 naming the source and the element position', async () => {
    const handler = defineValidatedEventHandler(
      {
        validate: {
          query: [
            schemaOutputting<{ page: number }>(() => ({ page: 1 })),
            schemaOutputting<{ tag: string }>(() => 'not an object at all'),
          ],
        },
      },
      () => 'the body never runs'
    )

    const { status, error } = await errorFrom(handler)

    expect(status).toBe(500)
    expect((error as Error).message).toContain('query')
    expect((error as Error).message).toContain('index 1')
  })

  it('carries no marker, so an observability hook still reports it', async () => {
    const handler = defineValidatedEventHandler(
      {
        validate: {
          query: [
            schemaOutputting<{ page: number }>(() => ({ page: 1 })),
            schemaOutputting<{ tag: string }>(() => 'not an object at all'),
          ],
        },
      },
      () => 'the body never runs'
    )

    const { error } = await errorFrom(handler)

    // The whole point of marking only the 400: this is a bug in the route, and
    // a hook that skips validation failures must not swallow it.
    expect(readValidationMarker(error)).toBeUndefined()
  })

  it('refuses an exotic object the declaration guard let through', async () => {
    // The accepted cost of the structural object test: a `Date` output passes
    // the compile-time gate and is this merge's to refuse - its meaning lives
    // outside its own enumerable keys, so a spread would drop it silently.
    const handler = defineValidatedEventHandler(
      {
        validate: {
          query: [
            schemaOutputting<{ page: number }>(() => ({ page: 1 })),
            schemaOutputting<Date>(() => new Date()),
          ],
        },
      },
      () => 'the body never runs'
    )

    const { status, error } = await errorFrom(handler)

    expect(status).toBe(500)
    expect((error as Error).message).toContain('an instance of Date')
  })
})

describe('a lone element', () => {
  it('delivers exactly what a bare schema does', async () => {
    // `x` and `[x]` are one declaration: the tuple is normalized to an element
    // list, and a bare schema is the list holding it.
    const schema = z.object({ page: z.coerce.number() })

    const bare = await request(
      defineValidatedEventHandler(
        { validate: { query: schema } },
        (event, { query }) => ({ page: query.page })
      ),
      '/api/test?page=2'
    )
    const tupled = await request(
      defineValidatedEventHandler(
        { validate: { query: [schema] } },
        (event, { query }) => ({ page: query.page })
      ),
      '/api/test?page=2'
    )

    expect(tupled.status).toBe(bare.status)
    await expect(tupled.json()).resolves.toEqual(await bare.json())
  })

  it('passes its output through untouched, primitives and unions included', async () => {
    // Nothing to merge into, so nothing object-tests it: whichever branch of
    // the union matched arrives as it is - a bare number as readily as an
    // object. A two-element tuple would have refused the number.
    const pageOrAll = z.union([
      z.object({ page: z.string() }).transform(({ page }) => Number(page)),
      z.object({ all: z.literal('yes') }),
    ])

    const handler = defineValidatedEventHandler(
      { validate: { query: [pageOrAll] } },
      (event, { query }) => ({ query, type: typeof query })
    )

    const primitive = await request(handler, '/api/test?page=2')
    const object = await request(handler, '/api/test?all=yes')

    await expect(primitive.json()).resolves.toEqual({
      query: 2,
      type: 'number',
    })
    await expect(object.json()).resolves.toEqual({
      query: { all: 'yes' },
      type: 'object',
    })
  })
})
