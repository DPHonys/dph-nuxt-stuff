import type { StandardSchemaV1 } from '@standard-schema/spec'
import { defineEventHandler, readBody } from 'h3'
import type { EventHandler, EventHandlerRequest, H3Event } from 'h3'
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { defineBetterEventHandler } from '../../src/runtime/server'
import type {
  KnownErrorsOfHandler,
  RequestInputOfHandler,
  ResponseOutputOfHandler,
  ValidationFailed,
} from '../../src/runtime/types'

/**
 * The `H3Event<Request>` slot the returned Handler fills, read the way Nuxt
 * 4.6's extractor reads it: through an `infer` that inherits h3's
 * `EventHandlerRequest` constraint, so a slot h3 would not accept reads as
 * `never` here exactly as it does there. Nuxt's own `RequestBodyOf` and
 * `RequestQueryOf` are the agreement suite's, which needs a Nuxt 4.6 app; this
 * file runs on every Nuxt the package claims.
 */
type SlotOf<Handler> = Handler extends (event: H3Event<infer Request>) => any
  ? Request
  : never

/** What h3 v1 lets one query key carry: ufo's `QueryValue | QueryValue[]`. */
type QueryCarriable = NonNullable<EventHandlerRequest['query']>[string]

/** A Standard Schema of the given input and output, for shapes zod cannot spell. */
function schema<Input, Output = Input>(): StandardSchemaV1<Input, Output> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      // Never called: the file is only ever compiled.
      validate: () => ({ issues: [] }),
    },
  }
}

const everything = defineBetterEventHandler(
  {
    input: {
      route: z.object({ id: z.string() }),
      query: [
        z.object({ a: z.string() }),
        z.object({ b: z.number().optional() }),
      ],
      headers: z.object({ 'x-tenant': z.string() }),
      body: z.object({ n: z.string().transform(Number) }),
    },
    output: { 200: z.object({ ok: z.literal(true) }), 204: null },
    errors: { gone: { status: 410, schema: z.object({ id: z.string() }) } },
  },
  async (event, { respond }) => {
    // The author's event is h3's own: nothing is claimed about a request the
    // Handler reads past its context.
    expectTypeOf(event).toEqualTypeOf<H3Event<EventHandlerRequest>>()
    expectTypeOf(await readBody(event)).toBeAny()

    return respond(200, { ok: true })
  }
)

describe('the native slot', () => {
  it('holds the declared body and query, as schema input types', () => {
    expectTypeOf<SlotOf<typeof everything>>().toEqualTypeOf<{
      body: { n: string }
      query: { a: string; b?: number }
    }>()
    expectTypeOf(everything).toExtend<
      EventHandler<
        { body: { n: string }; query: { a: string; b?: number } },
        Promise<{ ok: true } | null>
      >
    >()
  })

  it('has no key for a source the route does not declare', () => {
    const _queryOnly = defineBetterEventHandler(
      { input: { query: z.object({ q: z.string() }) } },
      () => 1
    )
    const _routeAndHeaders = defineBetterEventHandler(
      {
        input: {
          route: z.object({ id: z.string() }),
          headers: z.object({ 'x-tenant': z.string() }),
        },
      },
      () => 1
    )
    const _errorsOnly = defineBetterEventHandler(
      { errors: { gone: { status: 410 } } },
      () => 1
    )
    const _outputOnly = defineBetterEventHandler(
      { output: z.object({ total: z.number() }) },
      () => ({ total: 1 })
    )

    expectTypeOf<SlotOf<typeof _queryOnly>>().toEqualTypeOf<{
      query: { q: string }
    }>()
    expectTypeOf<keyof SlotOf<typeof _routeAndHeaders>>().toBeNever()
    expectTypeOf<keyof SlotOf<typeof _errorsOnly>>().toBeNever()
    expectTypeOf<keyof SlotOf<typeof _outputOnly>>().toBeNever()
  })

  it('carries a coerce query, its non-query values widened to any query value', () => {
    const _search = defineBetterEventHandler(
      {
        input: {
          query: z.object({
            q: z.string(),
            page: z.coerce.number().optional(),
          }),
        },
      },
      () => 1
    )

    expectTypeOf<SlotOf<typeof _search>>().not.toBeNever()
    expectTypeOf<SlotOf<typeof _search>>().toEqualTypeOf<{
      query: { q: string; page?: QueryCarriable }
    }>()
    // Our own slot keeps the schema's input exactly.
    expectTypeOf<RequestInputOfHandler<typeof _search>>().toEqualTypeOf<{
      query: { q: string; page?: unknown }
    }>()
  })

  it('widens a value outside the query values, and keeps every one inside them', () => {
    interface Filters {
      status: 'open' | 'closed'
    }

    const _mixed = defineBetterEventHandler(
      {
        input: {
          query: schema<{
            id: bigint
            either: string | bigint
            filters: Filters
            at: Date
            tags: string[]
            flag: boolean | null
          }>(),
        },
      },
      () => 1
    )

    expectTypeOf<SlotOf<typeof _mixed>>().toEqualTypeOf<{
      query: {
        id: QueryCarriable
        either: QueryCarriable
        filters: Filters
        at: Date
        tags: string[]
        flag: boolean | null
      }
    }>()
  })

  it('restates an interface-typed query, which has no implicit index signature', () => {
    interface Filters {
      status: 'open' | 'closed'
    }

    const _filtered = defineBetterEventHandler(
      { input: { query: schema<Filters>() } },
      () => 1
    )

    expectTypeOf<SlotOf<typeof _filtered>>().toEqualTypeOf<{
      query: { status: 'open' | 'closed' }
    }>()
  })

  it('keeps the body when the query is no record, which h3 would refuse', () => {
    const _arrayQuery = defineBetterEventHandler(
      {
        input: {
          query: schema<string[]>(),
          body: z.object({ title: z.string() }),
        },
      },
      () => 1
    )
    const _unionQuery = defineBetterEventHandler(
      { input: { query: schema<{ a: string } | string[]>() } },
      () => 1
    )

    expectTypeOf<SlotOf<typeof _arrayQuery>>().toEqualTypeOf<{
      body: { title: string }
      query: never
    }>()
    expectTypeOf<SlotOf<typeof _unionQuery>>().toEqualTypeOf<{
      query: { a: string }
    }>()
  })

  it('passes every body through as declared, h3 typing it any', () => {
    const _tags = defineBetterEventHandler(
      { input: { body: z.array(z.string()) } },
      () => 1
    )
    const _count = defineBetterEventHandler(
      { input: { body: z.number() } },
      () => 1
    )

    expectTypeOf<SlotOf<typeof _tags>>().toEqualTypeOf<{ body: string[] }>()
    expectTypeOf<SlotOf<typeof _count>>().toEqualTypeOf<{ body: number }>()
  })
})

describe('each reader reads only its own slot', () => {
  it('reads the brands off a branded Handler, whatever the slot holds', () => {
    expectTypeOf<RequestInputOfHandler<typeof everything>>().toEqualTypeOf<{
      route: { id: string }
      query: { a: string; b?: number }
      headers: { 'x-tenant': string }
      body: { n: string }
    }>()
    expectTypeOf<ResponseOutputOfHandler<typeof everything>>().toEqualTypeOf<{
      200: { ok: true }
      204: null
    }>()
    // Each variant is its tag beside its fields, so read both ways rather
    // than spelled as one literal.
    type Declared = { _tag: 'gone'; id: string } | ValidationFailed
    expectTypeOf<KnownErrorsOfHandler<typeof everything>>().toExtend<Declared>()
    expectTypeOf<Declared>().toExtend<KnownErrorsOfHandler<typeof everything>>()
  })

  it('reads nothing of ours off a _foreign handler that fills the slot itself', () => {
    const _foreign = defineEventHandler<{ body: { x: number } }>(() => 1)

    expectTypeOf<SlotOf<typeof _foreign>>().toEqualTypeOf<{
      body: { x: number }
    }>()
    expectTypeOf<RequestInputOfHandler<typeof _foreign>>().toBeNever()
    expectTypeOf<KnownErrorsOfHandler<typeof _foreign>>().toBeNever()
    expectTypeOf<ResponseOutputOfHandler<typeof _foreign>>().toBeNever()
  })

  it('is an h3 handler that h3 takes back', () => {
    expectTypeOf(everything).toExtend<EventHandler>()
    expectTypeOf(defineEventHandler(everything)).toExtend<EventHandler>()
  })
})
