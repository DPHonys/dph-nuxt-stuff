import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { H3Error } from 'h3'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  defineValidation,
  defineValidatedEventHandler,
} from '../../src/runtime/server'
import { postJson, request, schemaValidating, sourcesOfIssues } from '../h3-app'

/**
 * Composition at the same seam as everything else: real fragments, mounted in
 * a real h3 app, driven by real requests. What a composed declaration promises
 * is observable from outside - which schemas ran, what the handler body was
 * handed, and what a failure answered - so nothing here reaches for an
 * internal shape.
 */

describe('a group made by `defineValidation`', () => {
  it('passes to the wrapper alone, without array ceremony', async () => {
    const pagination = defineValidation({
      query: z.object({ page: z.coerce.number() }),
    })

    const handler = defineValidatedEventHandler(
      pagination,
      (event, { query }) => ({ page: query.page })
    )

    const response = await request(handler, '/api/test?page=2')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ page: 2 })
  })
})

describe('two fragments declaring one source', () => {
  const pagination = defineValidation({
    query: z.object({ page: z.coerce.number() }),
  })
  const sorting = defineValidation({
    query: z.object({ sort: z.enum(['asc', 'desc']) }),
  })

  it('both run, and their outputs merge flat', async () => {
    const handler = defineValidatedEventHandler(
      [...pagination, ...sorting],
      (event, { query }) => ({ page: query.page, sort: query.sort })
    )

    const response = await request(handler, '/api/test?page=2&sort=desc')

    // The bug that opened the whole composition design: object-spreading two
    // sets kept only the last one's schema, so `page` was never validated and
    // arrived as the string h3 yielded. Array spread appends, so both ran.
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ page: 2, sort: 'desc' })
  })

  it('mixes an inline fragment with spread groups', async () => {
    const handler = defineValidatedEventHandler(
      [...pagination, { body: z.object({ name: z.string() }) }],
      (event, { query, body }) => ({ page: query.page, name: body.name })
    )

    const response = await request(handler, '/api/test?page=2', {
      init: postJson(JSON.stringify({ name: 'ada' })),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ page: 2, name: 'ada' })
  })

  it('hands each fragment the same raw source value', async () => {
    const seen: unknown[] = []
    const spy = (): StandardSchemaV1 =>
      schemaValidating((raw) => {
        seen.push(raw)
        return { value: {} }
      })

    const handler = defineValidatedEventHandler(
      [{ query: spy() }, { query: spy() }],
      () => 'ok'
    )

    await request(handler, '/api/test?page=2')

    // Both fragments parse the whole raw source - which is what makes an
    // issue's `path` relative to the request and never to a fragment.
    expect(seen).toEqual([{ page: '2' }, { page: '2' }])
  })

  it('resolves an overlapping output key later-wins, in array order', async () => {
    const first = defineValidation({
      query: z.object({ page: z.literal('2') }),
    })
    const second = defineValidation({
      query: z.object({ page: z.coerce.number() }),
    })

    // The compiler poisons this declaration - two unnamed fragments producing
    // one output key - so both handlers reach for the delivered value through
    // a `@ts-expect-error`. That is the point of the rule being *documented*:
    // it says what a caller the types never saw is handed, and only that.
    const handler = defineValidatedEventHandler(
      [...first, ...second],
      // @ts-expect-error - the poisoned source has no `page` to read
      (event, { query }) => ({ page: query.page, type: typeof query.page })
    )

    const later = await request(handler, '/api/test?page=2')

    expect(later.status).toBe(200)
    await expect(later.json()).resolves.toEqual({ page: 2, type: 'number' })

    // Reversing the array reverses the answer: the rule is the order, not the
    // schemas.
    const reversed = defineValidatedEventHandler(
      [...second, ...first],
      // @ts-expect-error - the poisoned source has no `page` to read
      (event, { query }) => ({ page: query.page, type: typeof query.page })
    )

    await expect(
      (await request(reversed, '/api/test?page=2')).json()
    ).resolves.toEqual({ page: '2', type: 'string' })
  })
})

describe('a source whose fragments reject it', () => {
  const handler = defineValidatedEventHandler(
    [
      { query: z.object({ page: z.coerce.number() }) },
      { query: z.object({ sort: z.enum(['asc', 'desc']) }) },
      { body: z.object({ name: z.string() }) },
    ],
    () => 'the body never runs'
  )

  it('aggregates every fragment’s issues into one answer', async () => {
    const response = await request(handler, '/api/test?page=x&sort=sideways', {
      init: postJson(JSON.stringify({ name: 'ada' })),
    })

    const body = (await response.json()) as {
      data: { issues: Array<{ source: string; path: unknown[] }> }
    }

    // Fail-fast is between sources, never between one source's fragments: the
    // second fragment still ran after the first rejected, so a form with two
    // bad fields declared by two sets reports both in one round trip.
    expect(response.status).toBe(400)
    expect(body.data.issues).toEqual([
      { source: 'query', message: expect.any(String), path: ['page'] },
      { source: 'query', message: expect.any(String), path: ['sort'] },
    ])
  })

  it('still stops before the next source is read', async () => {
    const response = await request(handler, '/api/test?page=x&sort=sideways', {
      init: postJson('{ not json at all'),
    })

    // The payload is unparseable, so reading it would have answered with a
    // `body` issue instead. Every issue naming `query` is the proof that the
    // walk left at the first failing source, fragments or not.
    await expect(sourcesOfIssues(response)).resolves.toEqual(['query'])
  })

  it('never merges a source it rejected', async () => {
    let bodyRan = false

    const partly = defineValidatedEventHandler(
      [
        { query: z.object({ page: z.coerce.number() }) },
        { query: z.object({ sort: z.enum(['asc', 'desc']) }) },
      ],
      () => {
        bodyRan = true
        return 'the body never runs'
      }
    )

    const response = await request(partly, '/api/test?page=2&sort=sideways')

    // One fragment passing does not make the source valid: the handler body
    // must not run on a half-validated source.
    expect(bodyRan).toBe(false)
    expect(response.status).toBe(400)
  })
})

describe('outputs that cannot merge', () => {
  /** A source two fragments contribute to, one of them not an object. */
  const numericQuery = defineValidation({
    query: z.object({ page: z.string() }).transform(({ page }) => Number(page)),
  })
  const flags = defineValidation({ query: z.object({ archived: z.string() }) })

  it('answers 500 naming the source, the fragment and what it produced', async () => {
    let bodyRan = false
    let reported: H3Error | undefined

    const handler = defineValidatedEventHandler(
      [...flags, ...numericQuery],
      () => {
        bodyRan = true
        return 'the body never runs'
      }
    )

    const response = await request(handler, '/api/test?page=2&archived=yes', {
      onError: (error) => void (reported = error),
    })

    expect(bodyRan).toBe(false)
    expect(response.status).toBe(500)

    // Read from the operator's seat, which is where a 500's message belongs -
    // h3 keeps it off the wire, and this one names request-independent facts
    // about the route anyway. The three things the author needs to find it:
    // which source, which fragment of the declaration, and what that fragment
    // handed back.
    expect(reported?.message).toContain('query')
    expect(reported?.message).toContain('fragment 1')
    expect(reported?.message).toContain('number')
  })

  it('is a mis-declaration, not a validation failure', async () => {
    const handler = defineValidatedEventHandler(
      [...flags, ...numericQuery],
      () => 'the body never runs'
    )

    const response = await request(handler, '/api/test?page=2&archived=yes')

    // Nothing that says "the client sent bad input": no issues payload and not
    // this package's reason phrase, so an `error` hook that skips validation
    // failures still reports this one - it is a bug in the route.
    expect(response.statusText).not.toBe('Validation Error')
    await expect(response.json()).resolves.not.toMatchObject({
      data: { issues: expect.anything() },
    })
  })

  it('leaves a lone primitive output perfectly legal', async () => {
    const handler = defineValidatedEventHandler(
      numericQuery,
      (event, { query }) => ({ page: query, type: typeof query })
    )

    const response = await request(handler, '/api/test?page=2')

    // The error is about merging, not about primitives: there is nothing to
    // merge a single contribution into.
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ page: 2, type: 'number' })
  })

  it('refuses an output whose meaning is not its own keys', async () => {
    let reported: H3Error | undefined

    // A `Date` is the shape that would be lost quietly rather than loudly:
    // `Object.assign` copies its own enumerable keys, of which it has none, so
    // a fragment's whole contribution would vanish from the merged value while
    // the request still answered `200`. The compiler poisons it (no string
    // index signature); this is the same line drawn for the callers the types
    // never see.
    const handler = defineValidatedEventHandler(
      [...flags, { query: schemaValidating(() => ({ value: new Date() })) }],
      () => 'the body never runs'
    )

    const response = await request(handler, '/api/test?archived=yes', {
      onError: (error) => void (reported = error),
    })

    expect(response.status).toBe(500)
    expect(reported?.message).toContain('fragment 1')
    expect(reported?.message).toContain('Date')
  })

  it('merges a null-prototype output like any other plain object', async () => {
    const handler = defineValidatedEventHandler(
      [
        ...flags,
        {
          query: schemaValidating(() => ({
            value: Object.assign(Object.create(null) as object, { page: 2 }),
          })),
        },
      ],
      // @ts-expect-error - the hand-rolled schema infers `unknown` here
      (event, { query }) => ({ archived: query.archived, page: query.page })
    )

    const response = await request(handler, '/api/test?archived=yes')

    // h3 hands a form-urlencoded body over with a null prototype, so a schema
    // that passes its input through produces one - and it merges, because its
    // meaning really is its own keys.
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      archived: 'yes',
      page: 2,
    })
  })

  it('reports a rejecting fragment first: the merge is the last thing tried', async () => {
    const handler = defineValidatedEventHandler(
      [...flags, ...numericQuery],
      () => 'the body never runs'
    )

    const response = await request(handler, '/api/test?page=2')

    // `archived` is missing, so the first fragment rejects. Every fragment for
    // the source still parses, and only then is a merge attempted - so the
    // client gets the `400` it is owed rather than a `500` about a shape it
    // could do nothing about.
    expect(response.status).toBe(400)
    await expect(sourcesOfIssues(response)).resolves.toEqual(['query'])
  })
})
