import type { EventHandler, EventHandlerRequest } from 'h3'
import { defineEventHandler } from 'h3'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineValidatedEventHandler } from '../../src/runtime/server'
import type {
  InputOf,
  MergedInput,
  RequestInput,
  RequestInputOfHandler,
  SourceInput,
  ValidatedEventHandler,
} from '../../src/runtime/types'
import type { Assert, Equal } from './assert'

// The input side of the type family: what the client sends, before transforms.
// Compiled, never run, like the sibling surface suites.

const pagination = z.object({ page: z.number() })
const sorting = v.object({ sort: v.picklist(['asc', 'desc']) })
const csvTags = z.object({ tags: z.string().transform((s) => s.split(',')) })

/** The everyday declaration: one of each slot shape, with a transform in each. */
const declaration = {
  routerParams: v.object({ id: v.pipe(v.string(), v.transform(Number)) }),
  query: [pagination, sorting],
  body: csvTags,
} as const

// --- InputOf is the input, not the output, of a transforming schema --------

export function inputIsNotOutput(): void {
  type _input = Assert<Equal<InputOf<typeof csvTags>, { tags: string }>>
  type _notASchema = Assert<Equal<InputOf<number>, never>>
}

// --- A tuple's input is the flattened intersection of its elements ---------

export function tupleInputIntersects(): void {
  type _merged = Assert<
    Equal<
      MergedInput<readonly [typeof pagination, typeof sorting]>,
      { page: number; sort: 'asc' | 'desc' }
    >
  >
  type _single = Assert<
    Equal<MergedInput<readonly [typeof pagination]>, { page: number }>
  >
}

// --- SourceInput dispatches lone schema or tuple ---------------------------

export function sourceInputDispatches(): void {
  type _lone = Assert<Equal<SourceInput<typeof csvTags>, { tags: string }>>
  type _tuple = Assert<
    Equal<
      SourceInput<readonly [typeof pagination, typeof csvTags]>,
      { page: number; tags: string }
    >
  >
}

// --- RequestInput keys are exactly the declared sources --------------------

export function requestInputKeys(): void {
  type _keys = Assert<
    Equal<
      RequestInput<typeof declaration>,
      {
        routerParams: { id: string }
        query: { page: number; sort: 'asc' | 'desc' }
        body: { tags: string }
      }
    >
  >

  // A slot that may be `undefined` declares nothing, so it contributes no key -
  // the same rule `ValidatedContext` applies.
  type _undefinedSlotDropped = Assert<
    Equal<
      RequestInput<{ query: typeof pagination; body?: typeof csvTags }>,
      { query: { page: number } }
    >
  >
}

// --- The wrapper brands its handler with the computed Request input --------

export function brandedHandler(): void {
  const handler = defineValidatedEventHandler(
    { input: declaration },
    async (_event, { routerParams }) => ({ id: routerParams.id })
  )

  // Still the plain h3 `EventHandler` every call site accepted before.
  const _flows: EventHandler = handler
  const _typed: EventHandler<
    EventHandlerRequest,
    Promise<{ id: number }>
  > = handler
  type _branded = Assert<
    Equal<
      typeof handler,
      ValidatedEventHandler<
        EventHandlerRequest,
        Promise<{ id: number }>,
        RequestInput<typeof declaration>
      >
    >
  >

  // The brand reads back as the computed shape, not as the schemas.
  type _read = Assert<
    Equal<
      RequestInputOfHandler<typeof handler>,
      RequestInput<typeof declaration>
    >
  >
  type _computed = Assert<
    Equal<
      RequestInputOfHandler<typeof handler>,
      {
        routerParams: { id: string }
        query: { page: number; sort: 'asc' | 'desc' }
        body: { tags: string }
      }
    >
  >
}

// --- A route validating only routerParams carries no body or query key ----

export function routerParamsOnly(): void {
  const _handler = defineValidatedEventHandler(
    { input: { routerParams: z.object({ id: z.string() }) } },
    async (_event, { routerParams }) => routerParams.id
  )

  type _keys = Assert<
    Equal<
      RequestInputOfHandler<typeof _handler>,
      { routerParams: { id: string } }
    >
  >
}

// --- The brand is `never` on `any` and on a handler this package did not make

export function unbrandedIsNever(): void {
  type _any = Assert<Equal<RequestInputOfHandler<any>, never>>

  const _plain = defineEventHandler(() => 'ok')
  type _unbranded = Assert<Equal<RequestInputOfHandler<typeof _plain>, never>>

  type _unknown = Assert<Equal<RequestInputOfHandler<unknown>, never>>

  // The brand is a module-private symbol, so a handler spelling out a
  // look-alike string key cannot forge it.
  type _spoofed = Assert<
    Equal<
      RequestInputOfHandler<
        EventHandler & { __requestInput__?: { spoofed: true } }
      >,
      never
    >
  >
}

/** Keeps the file in vitest's inventory. */
describe('the request-input type surface', () => {
  it('is asserted by the compiler, not by this suite', () => {
    expect(defineValidatedEventHandler).toBeTypeOf('function')
  })
})
