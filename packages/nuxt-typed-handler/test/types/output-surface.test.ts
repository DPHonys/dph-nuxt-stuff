import { defineError } from '@dphonys/nuxt-handler-errors/server'
import type { KnownErrorsOfHandler } from '@dphonys/nuxt-handler-errors/types'
import type {
  RequestInputOfHandler,
  ResponseOutputOfHandler,
} from '@dphonys/nuxt-handler-validation/types'
import type { EventHandler } from 'h3'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineTypedEventHandler } from '../../src/runtime/server'
import type { Assert, Equal } from './assert'

// The Response-output surface on the umbrella: `output` forwarded from the
// validation parent, and what an output-only route is (and is not).
// Compiled, never run, like the sibling surface suites.

const user = z.object({ id: z.string(), name: z.string() })

const userErrors = defineError({ 'user-not-found': { status: 404 } })

// --- An output-only route -------------------------------------------------

export function outputOnlyRoute(): void {
  const handler = defineTypedEventHandler(
    { output: user },
    async (_event, _ctx) => {
      // No source and no error declaration, so the Handler context is empty:
      // no `errors` factories, and no validated keys either.
      // eslint-disable-next-line ts/no-empty-object-type
      type _context = Assert<Equal<typeof _ctx, {}>>

      return { id: '1', name: 'Ada' }
    }
  )

  // `output` is not a Validation source, so the built-in variant is not on.
  type _errors = Assert<Equal<KnownErrorsOfHandler<typeof handler>, never>>
  // eslint-disable-next-line ts/no-empty-object-type
  type _input = Assert<Equal<RequestInputOfHandler<typeof handler>, {}>>
  type _declared = Assert<
    Equal<
      ResponseOutputOfHandler<typeof handler>,
      { 200: { id: string; name: string } }
    >
  >

  // The h3 `Response` slot is still the body itself, so Nitro's generated
  // route type for an output route reads exactly as it did before.
  const _flows: EventHandler = handler
  type _response = Assert<
    Equal<ReturnType<typeof handler>, Promise<{ id: string; name: string }>>
  >
}

// --- `output` beside the other two halves ---------------------------------

export function everyHalfDeclared(): void {
  const _handler = defineTypedEventHandler(
    {
      input: { body: z.object({ name: z.string() }) },
      errors: [...userErrors],
      output: user,
    },
    async (_event, { body, errors }) => {
      if (body.name === '') throw errors.userNotFound()

      return { id: '1', name: body.name }
    }
  )

  type _errors = Assert<
    Equal<
      KnownErrorsOfHandler<typeof _handler>['tag'],
      'user-not-found' | 'validation-failed'
    >
  >
  type _declared = Assert<
    Equal<
      ResponseOutputOfHandler<typeof _handler>,
      { 200: { id: string; name: string } }
    >
  >
}

// --- A route without `output` carries no Response output ------------------

export function noOutputDeclared(): void {
  const _handler = defineTypedEventHandler(
    { errors: [...userErrors] },
    async () => ({ ok: true })
  )

  type _declared = Assert<
    Equal<ResponseOutputOfHandler<typeof _handler>, never>
  >
  type _response = Assert<
    Equal<ReturnType<typeof _handler>, Promise<{ ok: boolean }>>
  >
}

/** Keeps the file in vitest's inventory. */
describe('the umbrella’s response-output type surface', () => {
  it('is asserted by the compiler, not by this suite', () => {
    expect(defineTypedEventHandler).toBeTypeOf('function')
  })
})
