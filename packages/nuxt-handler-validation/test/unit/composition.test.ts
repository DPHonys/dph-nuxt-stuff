import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { EventHandler } from 'h3'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineValidatedEventHandler } from '../../src/runtime/server'
import { readValidationMarker } from '../../src/runtime/shared/error-marker'
import { request } from '../h3-app'

// The per-source tuple, driven through the same real-h3-app seam as every other
// runtime claim; the compile-time half lives in
// `test/types/composition-surface.test.ts`.

/** The reuse story's two units, from a different library each on purpose. */
const pagination = z.object({
  page: z.coerce.number(),
  size: z.coerce.number(),
})

const sorting = v.object({ sort: v.picklist(['asc', 'desc']) })

/**
 * A schema producing whatever `produce` hands back, under an output type of the
 * caller's choosing. The gap between the two is the point: it stands in for the
 * `any`-typed schema or plain-JS caller a suite cannot otherwise write.
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

/**
 * A schema whose result is neither branch of the interface: no `value`, and an
 * `issues` array with nothing in it. The Standard Schema types permit it, so a
 * hand-written schema can produce one; no library in the tree does.
 */
function schemaReportingNothing<Output>(): StandardSchemaV1<unknown, Output> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: () => ({ issues: [] }),
    },
  }
}

/**
 * A declaration whose `query` slot holds whatever a caller the types never saw
 * put there. The cast stands in for a plain-JS route file.
 */
function declaring(slot: unknown): { validate: { query: StandardSchemaV1 } } {
  return { validate: { query: slot } } as {
    validate: { query: StandardSchemaV1 }
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
    // elements parse the whole of it.
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
    // ran and rejected `sort`. Fail-fast is a rule across sources only.
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

    // Compared as a set, because the array order does follow the tuple - it is
    // only the *set* a client is promised.
    expect(reordered.status).toBe(written.status)
    await expect(sortedIssuesOf(reordered)).resolves.toEqual(
      await sortedIssuesOf(written)
    )
  })
})

describe('the merge of a tuple’s outputs', () => {
  it('is later-wins for the keys the declaration could not see', async () => {
    // Disjoint to the compiler, overlapping at runtime, so the declaration
    // guard has nothing to refuse and the merge itself is the rule.
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

    // The side-effect order is the whole observation: under `Promise.all` the
    // quick element would finish first.
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

    // Only the 400 is marked: this is a bug in the route, and a hook that skips
    // validation failures must not swallow it.
    expect(readValidationMarker(error)).toBeUndefined()
  })

  it('refuses an exotic object the declaration guard let through', async () => {
    // The accepted cost of the structural object test: a `Date` passes the
    // compile-time gate, and its meaning lives outside its own enumerable
    // keys, so a spread would drop it silently.
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

describe('an element that reports neither an output nor an issue', () => {
  /** The offending element, composed beside one that behaves. */
  const handler = defineValidatedEventHandler(
    {
      validate: {
        query: [
          schemaOutputting<{ page: number }>(() => ({ page: 1 })),
          schemaReportingNothing<{ tag: string }>(),
        ],
      },
    },
    (event, { query }) => ({ ...query })
  )

  it('is a 500 naming the source and the element position', async () => {
    const { status, error } = await errorFrom(handler)

    // The failure this replaces: the element contributed nothing, `issues`
    // stayed empty, and the request answered 200 with it missing from the
    // merge. Silent data loss is the one outcome the merge may never produce.
    expect(status).toBe(500)
    expect((error as Error).message).toContain('query')
    expect((error as Error).message).toContain('index 1')
  })

  it('carries no marker, so an observability hook still reports it', async () => {
    const { error } = await errorFrom(handler)

    // A bug in the route, not a client's bad input, so it takes the unmarked
    // 500 rather than the marked 400 a hook is invited to skip.
    expect(readValidationMarker(error)).toBeUndefined()
  })

  it('does not pre-empt the issues its siblings did report', async () => {
    const response = await request(
      defineValidatedEventHandler(
        {
          validate: {
            query: [schemaReportingNothing<{ page: number }>(), sorting],
          },
        },
        () => 'the body never runs'
      ),
      SPOILED
    )

    // A real rejection is what the client hears about; the void element is only
    // the answer when nothing else had anything to say.
    expect(response.status).toBe(400)
    expect(response.statusText).toBe('Validation Error')
    await expect(issuesOf(response)).resolves.toEqual(['query:sort'])
  })
})

describe('a source no schema ran for', () => {
  it('is a 500, not a 200 delivering an empty object', async () => {
    // The tuple type refuses `[]`, so this arrives only from plain JS or an
    // `any`-typed declaration. Delivering `{}` would tell the handler the query
    // validated when nothing looked at it.
    const declaredEmpty = [] as unknown as readonly [
      StandardSchemaV1<unknown, { page: number }>,
    ]

    const { status, error } = await errorFrom(
      defineValidatedEventHandler(
        { validate: { query: declaredEmpty } },
        (event, { query }) => ({ ...query })
      )
    )

    expect(status).toBe(500)
    expect((error as Error).message).toContain('query')
    expect(readValidationMarker(error)).toBeUndefined()
  })
})

describe('a source slot holding something that is not a schema', () => {
  it('is refused when the route is evaluated, not once per request', () => {
    // Without this refusal every request the route serves answers 500 with an
    // unattributed `TypeError: Cannot read properties of null` - naming neither
    // this package nor the source that broke.
    expect(() =>
      defineValidatedEventHandler(declaring(null), () => 'never evaluated')
    ).toThrowError(
      "[nuxt-handler-validation] cannot validate query: the value at index 0 is not a Standard Schema. A source slot holds a schema or a non-empty tuple of them - every element must carry a '~standard' property."
    )
  })

  it('names the offending element of a composed tuple', () => {
    expect(() =>
      defineValidatedEventHandler(
        declaring([pagination, { parse: () => ({}) }]),
        () => 'never evaluated'
      )
    ).toThrowError('cannot validate query: the value at index 1')
  })

  it('takes anything carrying the `~standard` contract, and nothing else', () => {
    expect(() =>
      defineValidatedEventHandler(
        declaring({
          '~standard': {
            version: 1,
            vendor: 'hand-written',
            validate: () => ({ value: undefined }),
          },
        }),
        () => 'never evaluated'
      )
    ).not.toThrow()

    // The contract is the `validate` function, so the marker property alone is
    // not enough to call something a schema.
    expect(() =>
      defineValidatedEventHandler(
        declaring({ '~standard': { version: 1, vendor: 'broken' } }),
        () => 'never evaluated'
      )
    ).toThrowError('is not a Standard Schema')
  })
})

describe('a lone element', () => {
  it('delivers exactly what a bare schema does', async () => {
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
    // Nothing to merge into, so nothing object-tests it. A two-element tuple
    // would have refused the number.
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
