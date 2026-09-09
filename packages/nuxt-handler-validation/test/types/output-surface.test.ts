import type { EventHandler, EventHandlerRequest } from 'h3'
import { defineEventHandler } from 'h3'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineValidatedEventHandler } from '../../src/runtime/server'
import type {
  RequestInputOfHandler,
  Respond,
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

// --- A map-form `output` is answered through `respond` --------------------

/** The two bodies the maps below promise, one per declared status. */
const existing = z.object({ id: z.string() })
const created = z.object({ id: z.string(), createdAt: z.string() })

export function statusMapRoute(): void {
  const handler = defineValidatedEventHandler(
    { output: { 200: existing, 201: created } },
    async (_event, { respond }) => {
      // The helper pairs a declared status with that status's body; the two
      // are checked together, which the misuse fixture next door proves.
      type _respond = Assert<
        Equal<
          typeof respond,
          Respond<{
            200: { id: string }
            201: { id: string; createdAt: string }
          }>
        >
      >

      return respond(201, { id: '1', createdAt: '2026-09-09' })
    }
  )

  // Still a plain h3 EventHandler, and its `Response` slot is the union of the
  // mapped bodies rather than the envelope carrying them - so Nitro's typed
  // routes and both fetch families see bodies, with no brand leaking through.
  const _flows: EventHandler = handler
  type _response = Assert<
    Equal<
      ReturnType<typeof handler>,
      Promise<{ id: string } | { id: string; createdAt: string }>
    >
  >

  // The map itself rides the phantom slot, available to a status-aware client.
  type _declared = Assert<
    Equal<
      ResponseOutputOfHandler<typeof handler>,
      { 200: { id: string }; 201: { id: string; createdAt: string } }
    >
  >
}

// --- A single-key map is still a map --------------------------------------

export function singleKeyStatusMap(): void {
  const _handler = defineValidatedEventHandler(
    { output: { 201: created } },
    async (_event, { respond }) =>
      respond(201, { id: '1', createdAt: '2026-09-09' })
  )

  // No plain-return shortcut: the one key is reached through the helper, and
  // the response is that key's body.
  type _response = Assert<
    Equal<
      ReturnType<typeof _handler>,
      Promise<{ id: string; createdAt: string }>
    >
  >
  type _declared = Assert<
    Equal<
      ResponseOutputOfHandler<typeof _handler>,
      { 201: { id: string; createdAt: string } }
    >
  >
}

// --- Any status may map to `null`, not just 204 ---------------------------

export function bodilessStatuses(): void {
  const _handler = defineValidatedEventHandler(
    { output: { 200: existing, 205: null } },
    async (_event, { respond }) => respond(205)
  )

  // A bodiless status contributes `null` to the union the client sees.
  type _response = Assert<
    Equal<ReturnType<typeof _handler>, Promise<{ id: string } | null>>
  >
  type _declared = Assert<
    Equal<
      ResponseOutputOfHandler<typeof _handler>,
      { 200: { id: string }; 205: null }
    >
  >
}

// --- The map form beside declared sources ---------------------------------

export function statusMapWithSources(): void {
  const _handler = defineValidatedEventHandler(
    {
      input: { body: z.object({ name: z.string() }) },
      output: { 201: created },
    },
    async (_event, { body, respond }) => {
      type _body = Assert<Equal<typeof body, { name: string }>>

      return respond(201, { id: body.name, createdAt: '2026-09-09' })
    }
  )

  type _input = Assert<
    Equal<RequestInputOfHandler<typeof _handler>, { body: { name: string } }>
  >
}

// --- A route declaring no output carries no Response output ---------------

export function inputOnlyRoute(): void {
  const _handler = defineValidatedEventHandler(
    { input: { query: z.object({ page: z.coerce.number() }) } },
    async (_event, validated) => {
      // Declaring no output offers no `respond`: the context is the declared
      // sources and nothing else.
      type _context = Assert<
        Equal<typeof validated, { query: { page: number } }>
      >

      return { page: validated.query.page }
    }
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
