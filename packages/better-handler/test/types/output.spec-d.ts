import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { EventHandler, EventHandlerRequest } from 'h3'
import { defineEventHandler } from 'h3'
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { defineBetterEventHandler } from '../../src/runtime/server'
import type {
  BetterEventHandler,
  Fail,
  HandlerReturn,
  KnownErrorsOfHandler,
  RequestInputOfHandler,
  Respond,
  Responded,
  ResponseBodies,
  ResponseOutput,
  ResponseOutputOfHandler,
  ResponseOutputs,
  SentResponse,
  ValidationFailed,
} from '../../src/runtime/types'

/** A receipt whose `at` is a string on the wire and a `Date` once parsed. */
const receipt = z.object({
  id: z.string(),
  at: z.string().transform((at) => new Date(at)),
})

const existing = z.object({ id: z.string() })
const created = z.object({ id: z.string(), createdAt: z.string() })

const pagination = z.object({ page: z.coerce.number() })

describe('the output type family', () => {
  it('reads the bare form as one 200, its schema’s output type', () => {
    expectTypeOf<ResponseOutputs<typeof receipt>>().toEqualTypeOf<{
      200: { id: string; at: Date }
    }>()
    expectTypeOf<ResponseBodies<typeof receipt>>().toEqualTypeOf<{
      id: string
      at: Date
    }>()
    expectTypeOf<HandlerReturn<typeof receipt>>().toEqualTypeOf<{
      id: string
      at: Date
    }>()
  })

  it('reads a status map status by status, null for a bodiless one', () => {
    const _map = { 200: existing, 201: created, 204: null }
    type Map = typeof _map

    expectTypeOf<ResponseOutputs<Map>>().toEqualTypeOf<{
      200: { id: string }
      201: { id: string; createdAt: string }
      204: null
    }>()
    expectTypeOf<ResponseBodies<Map>>().toEqualTypeOf<
      { id: string } | { id: string; createdAt: string } | null
    >()
    expectTypeOf<HandlerReturn<Map>>().toEqualTypeOf<
      Responded<ResponseOutputs<Map>>
    >()
  })

  it('reads no output, and an empty map, as declaring nothing', () => {
    expectTypeOf<ResponseOutputs<undefined>>().toBeNever()
    // eslint-disable-next-line ts/no-empty-object-type -- the empty map itself
    expectTypeOf<ResponseOutputs<{}>>().toBeNever()
    expectTypeOf<HandlerReturn<undefined>>().toBeUnknown()
    expectTypeOf<
      SentResponse<undefined, Promise<{ ok: true }>>
    >().toEqualTypeOf<{
      ok: true
    }>()
  })

  it('takes either form as a ResponseOutput', () => {
    expectTypeOf(receipt).toExtend<ResponseOutput>()
    expectTypeOf({ 200: existing, 204: null }).toExtend<ResponseOutput>()
    expectTypeOf<StandardSchemaV1>().toExtend<ResponseOutput>()
  })
})

describe('a route declaring a bare output', () => {
  it('hands an output-only route an empty context', () => {
    defineBetterEventHandler({ output: receipt }, (_event, context) => {
      // eslint-disable-next-line ts/no-empty-object-type -- no key at all
      expectTypeOf(context).toEqualTypeOf<{}>()
      expectTypeOf(context).not.toHaveProperty('respond')

      return { id: '1', at: new Date() }
    })
  })

  it('answers with the schema’s output type, not the Handler’s narrower return', () => {
    // The fetch result is pinned to `InferOutput<output>`: an extra key the
    // Handler returns is not part of what the route promised.
    const _route = defineBetterEventHandler({ output: receipt }, async () => ({
      id: '1',
      at: new Date(),
      internal: true,
    }))

    expectTypeOf(_route).toEqualTypeOf<
      BetterEventHandler<
        EventHandlerRequest,
        Promise<StandardSchemaV1.InferOutput<typeof receipt>>,
        never,
        // eslint-disable-next-line ts/no-empty-object-type -- no source declared
        {},
        { 200: { id: string; at: Date } }
      >
    >()
    expectTypeOf(_route).toExtend<
      EventHandler<EventHandlerRequest, Promise<{ id: string; at: Date }>>
    >()
  })

  it('carries no Known error and no Request input of its own', () => {
    const _route = defineBetterEventHandler({ output: receipt }, () => ({
      id: '1',
      at: new Date(),
    }))

    expectTypeOf<KnownErrorsOfHandler<typeof _route>>().toBeNever()
    // eslint-disable-next-line ts/no-empty-object-type -- no key at all
    expectTypeOf<RequestInputOfHandler<typeof _route>>().toEqualTypeOf<{}>()
    expectTypeOf<ResponseOutputOfHandler<typeof _route>>().toEqualTypeOf<{
      200: { id: string; at: Date }
    }>()
  })
})

describe('a route declaring a status map', () => {
  const output = { 200: existing, 201: created, 204: null }

  it('hands the Respond helper, pairing each status with its body', () => {
    defineBetterEventHandler({ output }, (_event, context) => {
      expectTypeOf(context).toEqualTypeOf<{
        readonly respond: Respond<{
          200: { id: string }
          201: { id: string; createdAt: string }
          204: null
        }>
      }>()
      expectTypeOf(context.respond<200>).parameters.toEqualTypeOf<
        [status: 200, value: { id: string }]
      >()
      expectTypeOf(context.respond<204>).parameters.toEqualTypeOf<
        [status: 204]
      >()

      return context.respond(204)
    })
  })

  it('answers with the union of the mapped bodies, never the helper’s result', () => {
    const _route = defineBetterEventHandler({ output }, (_event, { respond }) =>
      respond(201, { id: '1', createdAt: '2026-10-25' })
    )

    expectTypeOf(_route).toExtend<
      EventHandler<
        EventHandlerRequest,
        Promise<{ id: string } | { id: string; createdAt: string } | null>
      >
    >()
    expectTypeOf<Awaited<ReturnType<typeof _route>>>().toEqualTypeOf<
      { id: string } | { id: string; createdAt: string } | null
    >()
    expectTypeOf<ResponseOutputOfHandler<typeof _route>>().toEqualTypeOf<{
      200: { id: string }
      201: { id: string; createdAt: string }
      204: null
    }>()
  })

  it('holds the Respond helper beside the sources and the Fail helper', () => {
    const errors = { 'order-locked': { status: 409 } } as const

    const _route = defineBetterEventHandler(
      { input: { query: pagination }, output: { 201: created }, errors },
      (_event, context) => {
        expectTypeOf(context.query).toEqualTypeOf<{ page: number }>()
        expectTypeOf(context.fail).toEqualTypeOf<Fail<typeof errors>>()
        expectTypeOf(context.respond).toEqualTypeOf<
          Respond<{ 201: { id: string; createdAt: string } }>
        >()

        return context.respond(201, { id: '1', createdAt: '2026-10-25' })
      }
    )

    expectTypeOf<KnownErrorsOfHandler<typeof _route>>().toEqualTypeOf<
      { _tag: 'order-locked' } | ValidationFailed
    >()
  })
})

describe('the Response-output slot', () => {
  it('carries nothing for a route declaring no output', () => {
    const _route = defineBetterEventHandler(
      { input: { query: pagination } },
      () => ({ ok: true })
    )

    expectTypeOf<ResponseOutputOfHandler<typeof _route>>().toBeNever()
  })

  it('reads never off any, and off a handler this package did not produce', () => {
    const _plain = defineEventHandler(() => ({ ok: true }))

    expectTypeOf<ResponseOutputOfHandler<any>>().toBeNever()
    expectTypeOf<ResponseOutputOfHandler<typeof _plain>>().toBeNever()
  })
})
