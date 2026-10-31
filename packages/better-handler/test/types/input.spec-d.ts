import type { EventHandler, EventHandlerRequest, H3Event } from 'h3'
import { defineEventHandler } from 'h3'
import * as v from 'valibot'
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { defineBetterEventHandler } from '../../src/runtime/server'
import type {
  Fail,
  InputDeclaration,
  InputOf,
  KnownErrorsOfHandler,
  MergedInput,
  RequestInput,
  RequestInputOfHandler,
  SourceInput,
  ValidatedContext,
  ValidationFailed,
  ValidationIssue,
} from '../../src/runtime/types'

/** A page number, coerced from the string the wire always carries. */
const pagination = z.object({ page: z.coerce.number() })

/** A sort direction, from another library, composed beside `pagination`. */
const sorting = v.object({ sort: v.picklist(['asc', 'desc']) })

/** A route param whose input is a string and whose output is a number. */
const orderRef = z.object({ id: z.string().transform(Number) })

const draft = z.object({
  name: z.string(),
  tags: z.string().transform((tags) => tags.split(',')),
})

describe('the input type family', () => {
  it('reads a schema’s input, before any transform', () => {
    expectTypeOf<InputOf<typeof orderRef>>().toEqualTypeOf<{ id: string }>()
    expectTypeOf<InputOf<typeof pagination>>().toEqualTypeOf<{
      page: unknown
    }>()
    expectTypeOf<InputOf<'not a schema'>>().toBeNever()
  })

  it('intersects a tuple’s inputs into one flat record', () => {
    expectTypeOf<
      MergedInput<readonly [typeof orderRef, typeof sorting]>
    >().toEqualTypeOf<{ id: string; sort: 'asc' | 'desc' }>()
    expectTypeOf<
      SourceInput<readonly [typeof orderRef, typeof sorting]>
    >().toEqualTypeOf<{ id: string; sort: 'asc' | 'desc' }>()
    expectTypeOf<SourceInput<typeof orderRef>>().toEqualTypeOf<{
      id: string
    }>()
  })

  it('keys the Request input by declared source, each its input type', () => {
    expectTypeOf<
      RequestInput<{
        route: typeof orderRef
        query: readonly [typeof orderRef, typeof sorting]
      }>
    >().toEqualTypeOf<{
      route: { id: string }
      query: { id: string; sort: 'asc' | 'desc' }
    }>()
  })

  it('reads a slot that may be undefined as declaring nothing', () => {
    const _input: InputDeclaration = { query: pagination }

    // Annotated with the interface, every slot is optional: nothing is
    // guaranteed, so nothing is declared.
    // eslint-disable-next-line ts/no-empty-object-type -- no key at all
    expectTypeOf<RequestInput<typeof _input>>().toEqualTypeOf<{}>()
    // eslint-disable-next-line ts/no-empty-object-type -- no key at all
    expectTypeOf<ValidatedContext<typeof _input>>().toEqualTypeOf<{}>()
  })
})

describe('the Handler context of a route declaring input', () => {
  it('holds each declared source’s output, coercions and transforms applied', () => {
    defineBetterEventHandler(
      {
        input: {
          route: orderRef,
          query: pagination,
          headers: z.object({ 'x-trace': z.string() }),
          body: draft,
        },
      },
      (event, context) => {
        expectTypeOf(event).toEqualTypeOf<H3Event>()
        expectTypeOf(context).toEqualTypeOf<{
          readonly route: { id: number }
          readonly query: { page: number }
          readonly headers: { 'x-trace': string }
          readonly body: { name: string; tags: string[] }
        }>()

        return null
      }
    )
  })

  it('leaves an undeclared source and the Fail helper out entirely', () => {
    defineBetterEventHandler({ input: { query: pagination } }, (_, context) => {
      expectTypeOf(context).toEqualTypeOf<{
        readonly query: { page: number }
      }>()
      expectTypeOf(context).not.toHaveProperty('body')
      expectTypeOf(context).not.toHaveProperty('fail')

      return null
    })
  })

  it('merges a composed tuple’s outputs into one value', () => {
    defineBetterEventHandler(
      { input: { query: [pagination, sorting] } },
      (_, { query }) => {
        expectTypeOf(query).toEqualTypeOf<{
          page: number
          sort: 'asc' | 'desc'
        }>()

        return null
      }
    )
  })

  it('holds the Fail helper beside the sources when errors are declared too', () => {
    const errors = { 'order-not-found': { status: 404 } } as const

    defineBetterEventHandler(
      { input: { route: orderRef }, errors },
      (_, context) => {
        expectTypeOf(context.route).toEqualTypeOf<{ id: number }>()
        expectTypeOf(context.fail).toEqualTypeOf<Fail<typeof errors>>()
        expectTypeOf(context.fail)
          .parameter(0)
          .toEqualTypeOf<'order-not-found'>()

        return null
      }
    )
  })
})

describe('the Built-in validation-failed variant in the route’s errors', () => {
  it('is the whole union of a route declaring only input', () => {
    const _route = defineBetterEventHandler(
      { input: { query: pagination } },
      () => ({ ok: true })
    )

    expectTypeOf<
      KnownErrorsOfHandler<typeof _route>
    >().toEqualTypeOf<ValidationFailed>()
    expectTypeOf<ValidationFailed>().toEqualTypeOf<{
      _tag: 'validation-failed'
      issues: ValidationIssue[]
    }>()
  })

  it('joins the declared variants of a route declaring both', () => {
    const _route = defineBetterEventHandler(
      {
        input: { route: orderRef },
        errors: { 'order-locked': { status: 409 } },
      },
      () => ({ ok: true })
    )

    expectTypeOf<KnownErrorsOfHandler<typeof _route>>().toEqualTypeOf<
      { _tag: 'order-locked' } | ValidationFailed
    >()
  })

  it('is absent from a route declaring only errors', () => {
    const _route = defineBetterEventHandler(
      { errors: { 'order-locked': { status: 409 } } },
      () => ({ ok: true })
    )

    expectTypeOf<KnownErrorsOfHandler<typeof _route>>().toEqualTypeOf<{
      _tag: 'order-locked'
    }>()
  })

  it('is absent when every declared slot may be undefined', () => {
    const input: InputDeclaration = { query: pagination }
    const _route = defineBetterEventHandler(
      { input, errors: { 'order-locked': { status: 409 } } },
      () => ({ ok: true })
    )

    expectTypeOf<KnownErrorsOfHandler<typeof _route>>().toEqualTypeOf<{
      _tag: 'order-locked'
    }>()
  })
})

describe('the Request-input slot', () => {
  it('carries what a client sends, read back through RequestInputOfHandler', () => {
    const _route = defineBetterEventHandler(
      { input: { route: orderRef, query: [pagination, sorting], body: draft } },
      () => ({ ok: true })
    )

    expectTypeOf<RequestInputOfHandler<typeof _route>>().toEqualTypeOf<{
      route: { id: string }
      query: { page: unknown; sort: 'asc' | 'desc' }
      body: { name: string; tags: string }
    }>()
  })

  it('carries no source for a route declaring only errors', () => {
    const _route = defineBetterEventHandler(
      { errors: { 'order-locked': { status: 409 } } },
      () => ({ ok: true })
    )

    // eslint-disable-next-line ts/no-empty-object-type -- no key at all
    expectTypeOf<RequestInputOfHandler<typeof _route>>().toEqualTypeOf<{}>()
  })

  it('reads never off any, and off a handler this package did not produce', () => {
    const _plain = defineEventHandler(() => ({ ok: true }))

    expectTypeOf<RequestInputOfHandler<any>>().toBeNever()
    expectTypeOf<RequestInputOfHandler<typeof _plain>>().toBeNever()
  })

  it('leaves the returned handler an h3 handler answering with the settled return', () => {
    const _route = defineBetterEventHandler(
      { input: { query: pagination } },
      async () => ({ id: 7 })
    )

    expectTypeOf(_route).toExtend<
      EventHandler<EventHandlerRequest, Promise<{ id: number }>>
    >()
  })
})
