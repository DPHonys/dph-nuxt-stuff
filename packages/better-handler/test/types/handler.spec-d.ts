import { Schema } from 'effect'
import type { EventHandler, EventHandlerRequest, H3Event } from 'h3'
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import {
  defineBetterEventHandler,
  defineError,
  recognizeKnownError,
} from '../../src/runtime/server'
import type { Fail, HandlerContext, TaggedError } from '../../src/runtime/types'

const orderErrors = {
  'order-not-found': { status: 404, schema: z.object({ id: z.number() }) },
  'order-locked': { status: 409 },
} as const

// eslint-disable-next-line unicorn/throw-new-error -- Effect's error class builder, extended rather than thrown
class OrderMissing extends Schema.TaggedError<OrderMissing>()('OrderMissing', {
  id: Schema.Number,
}) {}

describe('defineBetterEventHandler with errors', () => {
  it('hands the Handler a plain h3 event and a context holding the Fail helper', () => {
    defineBetterEventHandler({ errors: orderErrors }, (event, context) => {
      expectTypeOf(event).toEqualTypeOf<H3Event>()
      expectTypeOf(context).toEqualTypeOf<HandlerContext<typeof orderErrors>>()
      expectTypeOf(context.fail).toEqualTypeOf<Fail<typeof orderErrors>>()
      expectTypeOf(context.fail)
        .parameter(0)
        .toEqualTypeOf<'order-not-found' | 'order-locked'>()

      return null
    })
  })

  it('infers the declaration literally, without an `as const`', () => {
    defineBetterEventHandler(
      {
        errors: {
          ...defineError('order-paid', {
            status: 409,
            schema: z.object({ paidAt: z.string() }),
          }),
          'order-locked': { status: 409 },
        },
      },
      (_event, { fail }) => {
        expectTypeOf(fail<'order-paid'>).parameters.toEqualTypeOf<
          [tag: 'order-paid', value: { paidAt: string }]
        >()

        return null
      }
    )
  })

  it('returns an h3 handler answering with what the Handler returns, settled', () => {
    const sync = defineBetterEventHandler({ errors: orderErrors }, () => ({
      id: 7,
    }))
    const async = defineBetterEventHandler(
      { errors: orderErrors },
      async () => ({ id: 7 })
    )

    expectTypeOf(sync).toEqualTypeOf<
      EventHandler<EventHandlerRequest, Promise<{ id: number }>>
    >()
    expectTypeOf(async).toEqualTypeOf<
      EventHandler<EventHandlerRequest, Promise<{ id: number }>>
    >()
  })

  it('takes an Effect error class as an Error declaration', () => {
    const route = defineBetterEventHandler(
      {
        errors: {
          OrderMissing: {
            status: 404,
            schema: Schema.toStandardSchemaV1(OrderMissing),
          },
        },
      },
      (_event, { fail }) => {
        expectTypeOf(fail).parameter(0).toEqualTypeOf<'OrderMissing'>()

        throw new OrderMissing({ id: 7 })
      }
    )

    expectTypeOf(route).toEqualTypeOf<
      EventHandler<EventHandlerRequest, Promise<never>>
    >()
  })
})

describe('the fields guard', () => {
  it('admits fields JSON carries, a nested toJSON followed', () => {
    const declared = defineError('order-dated', {
      status: 409,
      schema: z.object({
        at: z.date(),
        lines: z.array(z.object({ sku: z.string() })),
        note: z.unknown(),
      }),
    })

    expectTypeOf(declared).toHaveProperty('order-dated')
  })

  it('admits an Effect error class, whose methods are not fields', () => {
    const declared = defineError('OrderMissing', {
      status: 404,
      schema: Schema.toStandardSchemaV1(OrderMissing),
    })

    expectTypeOf(declared).toHaveProperty('OrderMissing')
  })
})

describe('recognizeKnownError', () => {
  it('takes an Error and answers the Tagged error or undefined', () => {
    expectTypeOf(recognizeKnownError).parameter(0).toEqualTypeOf<Error>()
    expectTypeOf(recognizeKnownError).returns.toEqualTypeOf<
      TaggedError | undefined
    >()
    expectTypeOf<TaggedError['_tag']>().toEqualTypeOf<string>()
  })
})
