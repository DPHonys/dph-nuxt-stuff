/**
 * A DELIBERATELY BROKEN fixture, compiled by `error-diagnostics.test.ts`
 * through the harness and never by `pnpm typecheck` (the package tsconfig
 * excludes this directory). No `@ts-expect-error` anywhere: the point is to
 * let each diagnostic through so the suite can read it.
 */

import { z } from 'zod'
import {
  defineBetterEventHandler,
  defineError,
} from '../../../src/runtime/server'

const missingOrder = z.object({
  _tag: z.literal('order-missing'),
  id: z.number(),
})

// --- defineError: the tag ---------------------------------------------------

export const reservedValidation = defineError('validation-failed', {
  status: 400,
})
export const reservedRequest = defineError('request-failed', { status: 502 })
export const emptyTag = defineError('', { status: 400 })

declare const someTag: string
export const widenedTag = defineError(someTag, { status: 400 })

declare const eitherTag: 'order-locked' | 'order-paid'
export const unionTag = defineError(eitherTag, { status: 409 })

// --- defineError: the entry -------------------------------------------------

export const tagMismatch = defineError('order-not-found', {
  status: 404,
  schema: missingOrder,
})
export const scalarFields = defineError('scalar-fields', {
  status: 400,
  schema: z.string(),
})
export const strayKey = defineError('stray-key', {
  status: 400,
  payload: z.object({ id: z.number() }),
})
export const bigintField = defineError('order-big', {
  status: 400,
  schema: z.object({ total: z.bigint() }),
})

// --- a route's errors map ---------------------------------------------------

export const mapReserved = defineBetterEventHandler(
  {
    errors: {
      'validation-failed': { status: 400 },
    },
  },
  () => null
)

export const mapMismatch = defineBetterEventHandler(
  {
    errors: {
      'order-not-found': { status: 404, schema: missingOrder },
    },
  },
  () => null
)

export const mapStray = defineBetterEventHandler(
  {
    errors: {
      'stray-key': { status: 400, payload: z.object({ id: z.number() }) },
    },
  },
  () => null
)

export const mapNumeric = defineBetterEventHandler(
  {
    errors: {
      404: { status: 404 },
    },
  },
  () => null
)

export const mapNested = defineBetterEventHandler(
  {
    errors: {
      'order-nested': {
        status: 400,
        schema: z.object({ lines: z.array(z.object({ sku: z.symbol() })) }),
      },
    },
  },
  () => null
)

// --- fail pairs a tag with its fields ---------------------------------------

export const failPairing = defineBetterEventHandler(
  {
    errors: {
      'order-not-found': { status: 404, schema: z.object({ id: z.number() }) },
      'order-locked': { status: 409 },
    },
  },
  (_event, { fail }) => {
    if (Math.random() > 0.5) throw fail('order-unknown')
    if (Math.random() > 0.5) throw fail('validation-failed')
    if (Math.random() > 0.5) throw fail('order-not-found')
    if (Math.random() > 0.5) throw fail('order-not-found', { id: 'seven' })
    if (Math.random() > 0.5) throw fail('order-locked', { id: 7 })

    return null
  }
)

// --- narrowing is Pick ------------------------------------------------------

const common = {
  ...defineError('unauthorized', { status: 401 }),
  ...defineError('forbidden', {
    status: 403,
    schema: z.object({ role: z.string() }),
  }),
}

const onlyUnauthorized: Pick<typeof common, 'unauthorized'> = common

export const pickedAway = defineBetterEventHandler(
  { errors: onlyUnauthorized },
  (_event, { fail }) => {
    throw fail('forbidden', { role: 'admin' })
  }
)
