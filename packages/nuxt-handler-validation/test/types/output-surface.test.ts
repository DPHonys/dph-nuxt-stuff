import type { EventHandler, EventHandlerRequest } from 'h3'
import { defineEventHandler } from 'h3'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineValidatedEventHandler } from '../../src/runtime/server'
import type {
  RequestInputOfHandler,
  ResponseOutputOfHandler,
  ValidatedEventHandler,
} from '../../src/runtime/types'
import type { Assert, Equal } from './assert'

// The Response-output side of the type family: what a route promises to send.
// Compiled, never run, like the sibling surface suites.

const user = z.object({ id: z.string(), name: z.string() })

/** A transforming output schema: the handler owes the output, not the input. */
const receipt = z.object({
  paidAt: z.string().transform((iso) => new Date(iso)),
})

// --- A bare `output` is one 200, returned plainly -------------------------

export function bareOutputRoute(): void {
  const handler = defineValidatedEventHandler({ output: user }, async () => ({
    id: '1',
    name: 'Ada',
  }))

  // Still a plain h3 EventHandler, and its `Response` slot is still the body
  // itself, so Nitro's typed routes read an output route exactly as before.
  const _flows: EventHandler = handler
  type _response = Assert<
    Equal<ReturnType<typeof handler>, Promise<{ id: string; name: string }>>
  >
  type _handler = Assert<
    Equal<
      typeof handler,
      ValidatedEventHandler<
        EventHandlerRequest,
        Promise<{ id: string; name: string }>,
        // eslint-disable-next-line ts/no-empty-object-type
        {},
        { 200: { id: string; name: string } }
      >
    >
  >
}

// --- The return is the schema's output, transforms already applied --------

export function transformedOutput(): void {
  const _handler = defineValidatedEventHandler(
    { output: receipt },
    async () => ({ paidAt: new Date() })
  )

  type _response = Assert<
    Equal<ReturnType<typeof _handler>, Promise<{ paidAt: Date }>>
  >
  type _declared = Assert<
    Equal<ResponseOutputOfHandler<typeof _handler>, { 200: { paidAt: Date } }>
  >
}

// --- An output-only route validates nothing -------------------------------

export function outputOnlyRoute(): void {
  const _handler = defineValidatedEventHandler(
    { output: user },
    async (_event, _validated) => {
      // No source declared, so the Validated context has no keys at all.
      // eslint-disable-next-line ts/no-empty-object-type
      type _context = Assert<Equal<typeof _validated, {}>>

      return { id: '1', name: 'Ada' }
    }
  )

  // eslint-disable-next-line ts/no-empty-object-type
  type _input = Assert<Equal<RequestInputOfHandler<typeof _handler>, {}>>
}

// --- Both halves together ---------------------------------------------------

export function inputAndOutput(): void {
  const _handler = defineValidatedEventHandler(
    {
      input: { body: z.object({ name: z.string() }) },
      output: user,
    },
    async (_event, { body }) => {
      type _body = Assert<Equal<typeof body, { name: string }>>

      return { id: '1', name: body.name }
    }
  )

  type _input = Assert<
    Equal<RequestInputOfHandler<typeof _handler>, { body: { name: string } }>
  >
  type _declared = Assert<
    Equal<
      ResponseOutputOfHandler<typeof _handler>,
      { 200: { id: string; name: string } }
    >
  >
}

// --- A route declaring no output carries no Response output ---------------

export function inputOnlyRoute(): void {
  const _handler = defineValidatedEventHandler(
    { input: { query: z.object({ page: z.coerce.number() }) } },
    async (_event, { query }) => ({ page: query.page })
  )

  type _declared = Assert<
    Equal<ResponseOutputOfHandler<typeof _handler>, never>
  >
  // The response is still the handler's own return, untouched by the slot.
  type _response = Assert<
    Equal<ReturnType<typeof _handler>, Promise<{ page: number }>>
  >
}

// --- The slot is `never` on `any` and on a handler this package did not make

export function unbrandedIsNever(): void {
  type _any = Assert<Equal<ResponseOutputOfHandler<any>, never>>

  const _plain = defineEventHandler(() => 'ok')
  type _unbranded = Assert<Equal<ResponseOutputOfHandler<typeof _plain>, never>>

  type _unknown = Assert<Equal<ResponseOutputOfHandler<unknown>, never>>

  // The slot is a module-private symbol, so a handler spelling out a
  // look-alike string key cannot forge it.
  type _spoofed = Assert<
    Equal<
      ResponseOutputOfHandler<
        EventHandler & { __responseOutput__?: { 200: { spoofed: true } } }
      >,
      never
    >
  >
}

// --- An explicit type argument cannot collapse the response to `any` ------

export function explicitTypeArgument(): void {
  // Both halves of the declaration are optional now, so the schemas parameter
  // carries a default and an explicit type argument is no longer an arity
  // error. What it cannot do is widen the response: with no output declared,
  // the response reads `unknown`, never `any`.
  const _handler = defineValidatedEventHandler<{
    query: typeof user
  }>({ input: { query: user } }, async () => null)

  type _response = Assert<Equal<ReturnType<typeof _handler>, unknown>>
}

/** Keeps the file in vitest's inventory. */
describe('the response-output type surface', () => {
  it('is asserted by the compiler, not by this suite', () => {
    expect(defineValidatedEventHandler).toBeTypeOf('function')
  })
})
