/**
 * The everyday route: a flat declaration, mixed schema libraries, validated
 * values eagerly typed in the second parameter, response type flowing out as
 * a plain h3 handler.
 */
import type { EventHandler } from 'h3'
import * as v from 'valibot'
import { z } from 'zod'
import {
  defineValidatedEventHandler,
  recognizeValidationError,
} from '../server'
import type { ValidationErrorData } from '../types'
import type { Assert, Equal } from './assert'

declare function updateUser(
  id: number,
  body: { name: string; tags: string[] }
): Promise<{ ok: boolean }>

// --- The README's own opening example, in the new shape -------------------

const handler = defineValidatedEventHandler(
  {
    validate: {
      routerParams: v.object({ id: v.pipe(v.string(), v.transform(Number)) }),
      query: z.object({ page: z.coerce.number() }),
      body: z.object({
        name: z.string(),
        tags: z.string().transform((s) => s.split(',')),
      }),
    },
  },
  async (_event, { routerParams, query, body }) => {
    type _routerParams = Assert<Equal<typeof routerParams, { id: number }>>
    type _query = Assert<Equal<typeof query, { page: number }>>
    type _body = Assert<Equal<typeof body, { name: string; tags: string[] }>>

    const updated = await updateUser(routerParams.id, body)
    return { ...updated, page: query.page }
  }
)

// The wrapper returns a plain h3 EventHandler, so Nitro's typed routes read
// the response exactly as they do for defineEventHandler.
const _flows: EventHandler = handler
type _response = Assert<
  Equal<ReturnType<typeof handler>, Promise<{ ok: boolean; page: number }>>
>

// --- A lone schema may output anything, primitives included ---------------

defineValidatedEventHandler(
  { validate: { body: z.string().transform((s) => s.length) } },
  async (_event, { body }) => {
    type _primitiveOutput = Assert<Equal<typeof body, number>>
    return body
  }
)

// --- A schema outputting a union stays a union ----------------------------

defineValidatedEventHandler(
  {
    validate: {
      body: z.union([
        z.object({ kind: z.literal('a'), a: z.number() }),
        z.object({ kind: z.literal('b'), b: z.string() }),
      ]),
    },
  },
  async (_event, { body }) => {
    // The runtime hands back whichever branch matched - never the branches'
    // merge - so the type is the union, and narrowing works.
    if (body.kind === 'a') {
      type _narrowed = Assert<Equal<typeof body.a, number>>
    }
    return null
  }
)

// --- Observability predicate ----------------------------------------------

declare const unknownError: unknown
const _recognized = recognizeValidationError(unknownError)
type _predicate = Assert<
  Equal<typeof _recognized, ValidationErrorData | undefined>
>
