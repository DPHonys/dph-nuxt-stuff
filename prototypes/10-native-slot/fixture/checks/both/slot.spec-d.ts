// PROTOTYPE (ticket 10), question 1: the slot shape and its four conditions.
import type {
  RequestBodyOf,
  RequestQueryOf,
} from '@nuxt/nitro-server/request-types'
import { defineEventHandler, readBody } from 'h3'
import type {
  EventHandler,
  EventHandlerRequest,
  EventHandlerResponse,
  H3Event,
} from 'h3'
import { describe, expectTypeOf, it } from 'vitest'
import type {
  BetterEventHandler,
  KnownErrorsOfHandler,
  NativeRequest,
  RequestInputOfHandler,
  ResponseOutputOfHandler,
  ValidationFailed,
} from '../../../lib/handler'
import { defineBetterEventHandler } from '../../../lib/handler'
import { schema } from '../../../lib/schema'

const everything = defineBetterEventHandler(
  {
    input: {
      route: schema<{ id: string }>(),
      query: [schema<{ a: string }>(), schema<{ b?: number }>()],
      headers: schema<{ 'x-t': string }>(),
      body: schema<{ n: string }, { n: number }>(),
    },
    output: { 200: schema<{ ok: true }>(), 204: null },
    errors: { gone: { status: 410, schema: schema<{ id: string }>() } },
  },
  async (event, { respond }) => {
    // (a) the author's `event` is h3's default event, so `readBody` is not lied to.
    expectTypeOf(event).toEqualTypeOf<H3Event>()
    expectTypeOf(await readBody(event)).toBeAny()
    return respond(200, { ok: true })
  }
)
type Everything = typeof everything

const outputOnly = defineBetterEventHandler(
  { output: schema<{ total: number }>() },
  () => ({ total: 1 })
)
const errorsOnly = defineBetterEventHandler(
  { errors: { nope: { status: 404 } } },
  () => 1
)
const queryOnly = defineBetterEventHandler(
  { input: { query: schema<{ q: string }>() } },
  () => 1
)

describe('(a) callback event', () => {
  it('stays H3Event<EventHandlerRequest>', () => {
    defineBetterEventHandler(
      { input: { body: schema<{ a: string }>() } },
      (event) => {
        expectTypeOf(event).toEqualTypeOf<H3Event<EventHandlerRequest>>()
        return 1
      }
    )
  })
})

describe('the slot itself', () => {
  it('is the Request input restricted to body and query, keys only for declared sources', () => {
    expectTypeOf<Everything>().toExtend<
      EventHandler<
        { body: { n: string }; query: { a: string; b?: number } },
        Promise<{ ok: true } | null>
      >
    >()
    expectTypeOf<
      keyof NativeRequest<{ query: ReturnType<typeof schema<{ q: string }>> }>
    >().toEqualTypeOf<'query'>()
    expectTypeOf<
      keyof NativeRequest<{ route: ReturnType<typeof schema<{ id: string }>> }>
    >().toBeNever()
    expectTypeOf<RequestBodyOf<Everything>>().toEqualTypeOf<{ n: string }>()
    expectTypeOf<RequestQueryOf<Everything>>().toEqualTypeOf<{
      a: string
      b?: number
    }>()
  })
})

describe('(b) phantom brands still read, each reader only its own slot', () => {
  it('request input carries every declared source (route and headers too)', () => {
    expectTypeOf<RequestInputOfHandler<Everything>>().toEqualTypeOf<{
      route: { id: string }
      query: { a: string; b?: number }
      headers: { 'x-t': string }
      body: { n: string }
    }>()
  })
  it('response output and known errors', () => {
    expectTypeOf<ResponseOutputOfHandler<Everything>>().toEqualTypeOf<{
      200: { ok: true }
      204: null
    }>()
    expectTypeOf<KnownErrorsOfHandler<Everything>>().toEqualTypeOf<
      { _tag: 'gone'; id: string } | ValidationFailed
    >()
    expectTypeOf<KnownErrorsOfHandler<errorsOnlyT>>().toEqualTypeOf<{
      _tag: 'nope'
    }>()
  })
  it('Nuxt reads the H3Event slot, never a brand', () => {
    // Brand says "body declared", slot says nothing: Nuxt sees nothing.
    type BrandOnly = BetterEventHandler<{}, unknown, { body: { a: string } }>
    expectTypeOf<RequestBodyOf<BrandOnly>>().toBeNever()
  })
  it('our readers read brands, never the slot', () => {
    // Slot filled, no brand (h3's own generic): our readers see nothing.
    const foreign = defineEventHandler<{ body: { x: number } }>(() => 1)
    expectTypeOf<RequestInputOfHandler<typeof foreign>>().toBeNever()
    expectTypeOf<KnownErrorsOfHandler<typeof foreign>>().toBeNever()
    expectTypeOf<ResponseOutputOfHandler<typeof foreign>>().toBeNever()
    expectTypeOf<RequestBodyOf<typeof foreign>>().toEqualTypeOf<{ x: number }>()
  })
})
type errorsOnlyT = typeof errorsOnly

describe('(c) h3 constraint satisfied', () => {
  it('is an h3 EventHandler and defineEventHandler takes it back', () => {
    expectTypeOf(everything).toExtend<
      EventHandler<EventHandlerRequest, EventHandlerResponse>
    >()
    expectTypeOf(outputOnly).toExtend<EventHandler>()
    const wrapped = defineEventHandler(everything)
    expectTypeOf(wrapped).toExtend<EventHandler>()
    expectTypeOf(defineEventHandler(queryOnly)).toExtend<
      EventHandler<{ query: { q: string } }>
    >()
  })
})

describe('(d) a route declaring no body contributes never, not unknown', () => {
  it('output-only, errors-only, query-only', () => {
    expectTypeOf<RequestBodyOf<typeof outputOnly>>().toBeNever()
    expectTypeOf<RequestQueryOf<typeof outputOnly>>().toBeNever()
    expectTypeOf<RequestBodyOf<errorsOnlyT>>().toBeNever()
    expectTypeOf<RequestBodyOf<typeof queryOnly>>().toBeNever()
    expectTypeOf<RequestBodyOf<typeof queryOnly>>().not.toBeUnknown()
  })
})

describe('control: the pre-slot shape (Request left at h3 default) hides declared inputs', () => {
  it('reads never for a declared body', () => {
    type Old = BetterEventHandler<
      EventHandlerRequest,
      unknown,
      { body: { a: string } }
    >
    expectTypeOf<RequestBodyOf<Old>>().toBeNever()
  })
})
