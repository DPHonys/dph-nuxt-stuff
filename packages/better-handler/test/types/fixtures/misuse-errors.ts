/**
 * A DELIBERATELY BROKEN fixture, compiled by `error-diagnostics.test.ts`
 * through the harness and never by `pnpm typecheck` (the package tsconfig
 * excludes this directory). No `@ts-expect-error` anywhere: the point is to
 * let each diagnostic through so the suite can read it.
 */

import type { StandardSchemaV1 } from '@standard-schema/spec'
import { z } from 'zod'
import {
  defineBetterEventHandler,
  defineError,
} from '../../../src/runtime/server'
import type { ErrorEntry } from '../../../src/runtime/types'

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

// A pattern is no one literal: spread, it would admit `fail('x-anything')`.
declare const patternTag: `x-${string}`
export const patternedTag = defineError(patternTag, { status: 400 })

// --- defineError: the entry -------------------------------------------------

export const tagMismatch = defineError('order-not-found', {
  status: 404,
  schema: missingOrder,
})
// The schema's input carries the tag the check validates, whatever it outputs.
export const tagMismatchInput = defineError('order-relabelled', {
  status: 404,
  schema: z.object({
    _tag: z
      .literal('order-missing')
      .transform(() => 'order-relabelled' as const),
  }),
})
export const scalarFields = defineError('scalar-fields', {
  status: 400,
  schema: z.string(),
})
// One member of a union input that is no object of fields is enough.
export const mixedArrayFields = defineError('mixed-array', {
  status: 400,
  schema: z.union([z.object({ id: z.number() }), z.array(z.number())]),
})
declare const mixedCallable: StandardSchemaV1<{ id: number } | (() => void)>
export const mixedCallableFields = defineError('mixed-callable', {
  status: 400,
  schema: mixedCallable,
})
export const strayKey = defineError('stray-key', {
  status: 400,
  payload: z.object({ id: z.number() }),
})
export const bigintField = defineError('order-big', {
  status: 400,
  schema: z.object({ total: z.bigint() }),
})

// A numeric key is a field too, at the top and inside a record.
declare const indexedBigints: StandardSchemaV1<{
  values: Record<number, bigint>
}>
declare const numericBigint: StandardSchemaV1<{ 0: bigint }>

export const indexedField = defineError('order-indexed', {
  status: 400,
  schema: indexedBigints,
})
export const numericField = defineError('order-numbered', {
  status: 400,
  schema: numericBigint,
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

declare const patterned: {
  readonly [Tag in `x-${string}`]: { readonly status: 400 }
}
export const mapPatterned = defineBetterEventHandler(
  { errors: patterned },
  () => null
)

export const mapMixed = defineBetterEventHandler(
  {
    errors: {
      'mixed-array': {
        status: 400,
        schema: z.union([z.object({ id: z.number() }), z.array(z.number())]),
      },
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

// The fields are what is thrown and sent: a transforming schema's input.
export const failTransformed = defineBetterEventHandler(
  {
    errors: {
      'order-dated': {
        status: 409,
        schema: z.object({ id: z.string().transform(Number) }),
      },
    },
  },
  (_event, { fail }) => {
    throw fail('order-dated', { id: 7 })
  }
)

// An untyped schema's input is `any`, and the runtime still demands its
// fields object.
declare const untypedSchema: StandardSchemaV1<any, any>

export const untypedWithoutFields = defineBetterEventHandler(
  { errors: { untyped: { status: 400, schema: untypedSchema } } },
  (_event, { fail }) => {
    throw fail('untyped')
  }
)

// A schema typed optional is still a schema when the entry holds one.
const orderRef = z.object({ id: z.number() })

interface OptionalSchemaEntry {
  readonly status: 400
  readonly schema?: typeof orderRef
}

const optionalEntry: OptionalSchemaEntry = { status: 400, schema: orderRef }

export const optionalWithoutFields = defineBetterEventHandler(
  { errors: { optional: optionalEntry } },
  (_event, { fail }) => {
    throw fail('optional')
  }
)

const annotatedEntry: ErrorEntry = {
  status: 400,
  schema: z.object({ id: z.number() }),
}

export const annotatedWithoutFields = defineBetterEventHandler(
  { errors: { annotated: annotatedEntry } },
  (_event, { fail }) => {
    throw fail('annotated')
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
