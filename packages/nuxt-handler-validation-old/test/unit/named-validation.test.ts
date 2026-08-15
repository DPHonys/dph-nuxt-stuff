import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  defineValidation,
  defineValidatedEventHandler,
} from '../../src/runtime/server'
import { request, schemaValidating } from '../h3-app'

/**
 * Named sets at the same seam as everything else: real fragments, mounted in a
 * real h3 app, driven by real requests. What a name does is observable from
 * outside - the shape the handler body was handed, what each schema was asked
 * to parse, and what a failure said.
 *
 * One assertion reads a group's fragment directly. That is not a reach for an
 * internal: indexing a group (`pagination[0].query`) is the only way a consumer
 * can name a set's output type today, which the design spec records as a known
 * ergonomic gap - so the tuple's contents are surface, not implementation.
 */

const pagination = defineValidation('pagination', {
  query: z.object({ page: z.coerce.number() }),
})
const sorting = defineValidation('sorting', {
  query: z.object({ sort: z.enum(['asc', 'desc']) }),
})

describe('a named set', () => {
  it('nests its output under its name when it is the only set', async () => {
    const handler = defineValidatedEventHandler(
      pagination,
      (event, { query }) => query.pagination
    )

    const response = await request(handler, '/api/test?page=2')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ page: 2 })
  })

  it('nests identically once another set joins it', async () => {
    const handler = defineValidatedEventHandler(
      [...pagination, ...sorting],
      (event, { query }) => query
    )

    const response = await request(handler, '/api/test?page=2&sort=desc')

    // The shape of what was already there does not change when a set is added
    // - which is the whole reason the nesting is uniform rather than only
    // applied on collision.
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      pagination: { page: 2 },
      sorting: { sort: 'desc' },
    })
  })

  it('namespaces every source it declares, not just one', async () => {
    const auth = defineValidation('auth', {
      query: z.object({ token: z.string() }),
      headers: z.object({ authorization: z.string() }),
    })

    const handler = defineValidatedEventHandler(
      auth,
      (event, { query, headers }) => ({
        token: query.auth.token,
        authorization: headers.auth.authorization,
      })
    )

    const response = await request(handler, '/api/test?token=t', {
      init: { headers: { authorization: 'Bearer x' } },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      token: 't',
      authorization: 'Bearer x',
    })
  })

  it('keeps its name off its own keys', () => {
    // The name rides a `unique symbol`, so it never shows up in `Object.keys` -
    // which is what lets the runtime read a fragment's sources with no
    // exclusion list, and what makes a name unforgeable from a literal.
    expect(Object.keys(pagination[0])).toEqual(['query'])
  })

  it('delivers a non-object output under its name, unmerged', async () => {
    const count = defineValidation('count', {
      query: z.object({ n: z.string() }).transform(({ n }) => Number(n)),
    })
    const flags = defineValidation({
      query: z.object({ archived: z.string() }),
    })

    const handler = defineValidatedEventHandler(
      [...flags, ...count],
      (event, { query }) => ({ count: query.count, archived: query.archived })
    )

    const response = await request(handler, '/api/test?n=3&archived=yes')

    // A named output is assigned under its own key rather than spread into
    // anything, so it needs no merge legality at all - the `500` that guards
    // the flat merge has nothing to say about it.
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      count: 3,
      archived: 'yes',
    })
  })
})

describe('a set name meeting an unnamed output key', () => {
  const named = defineValidation('page', { query: z.object({ n: z.string() }) })
  const unnamed = defineValidation({ query: z.object({ page: z.string() }) })

  it.each([
    ['the named set spread first', true],
    ['the named set spread last', false],
  ])('is named-wins with %s', async (_label, namedFirst) => {
    const fragments = namedFirst
      ? [...named, ...unnamed]
      : [...unnamed, ...named]

    // The compiler poisons this source, so the handler hands the whole value
    // back rather than reading a key off it: a poison fails on property
    // access, which is exactly what a caller the types never saw would do.
    const handler = defineValidatedEventHandler(
      fragments,
      (event, { query }) => query
    )

    const response = await request(handler, '/api/test?n=1&page=2')

    // The merge is two-phase - unnamed outputs shallow-merge first, then the
    // named layer is assigned - which is what makes this independent of where
    // in the array the named set sat.
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ page: { n: '1' } })
  })
})

describe('namespacing an output', () => {
  it('leaves every schema parsing the whole raw source', async () => {
    const seen: unknown[] = []
    const spy = defineValidation('spy', {
      query: schemaValidating((raw) => {
        seen.push(raw)
        return { value: {} }
      }),
    })

    const handler = defineValidatedEventHandler(
      [...pagination, ...spy],
      () => 'ok'
    )

    await request(handler, '/api/test?page=2')

    // The name is an output-side namespace and nothing else: the wire shape is
    // untouched, so a client still sends `?page=2` flat.
    expect(seen).toEqual([{ page: '2' }])
  })

  it('never names the set in a failing issue’s path', async () => {
    const handler = defineValidatedEventHandler(pagination, () => 'ok')

    const response = await request(handler, '/api/test?page=nonsense')
    const body = (await response.json()) as {
      data: { issues: Array<{ source: string; path: unknown[] }> }
    }

    // The issue describes what the client sent, which was never nested.
    expect(response.status).toBe(400)
    expect(body.data.issues).toEqual([
      { source: 'query', message: expect.any(String), path: ['page'] },
    ])
  })
})
