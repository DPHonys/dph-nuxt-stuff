/**
 * A DELIBERATELY BROKEN fixture, compiled by `error-diagnostics.test.ts`
 * through the harness and never by `pnpm typecheck` (the package tsconfig
 * excludes this directory). No `@ts-expect-error` anywhere: the point is to
 * let each diagnostic through so the suite can read it.
 */

import type { StandardSchemaV1 } from '@standard-schema/spec'
import { z } from 'zod'
import { defineError } from '../../../src/runtime/server'
import type {
  ErrorDeclarations,
  ErrorEntry,
  Fail,
} from '../../../src/runtime/types'
import type { ErrorDeclarationsGuard } from '../../../src/runtime/types/errors/declaration'

// A route's `errors` option, as the handler wrapper takes it: the map
// intersected with its guard, and the Fail helper typed from it.
declare function route<const Errors extends ErrorDeclarations>(
  errors: Errors & ErrorDeclarationsGuard<Errors>
): Fail<Errors>

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

// --- a route's errors map ---------------------------------------------------

export const mapReserved = route({
  'validation-failed': { status: 400 },
})

export const mapMismatch = route({
  'order-not-found': { status: 404, schema: missingOrder },
})

export const mapStray = route({
  'stray-key': { status: 400, payload: z.object({ id: z.number() }) },
})

export const mapNumeric = route({
  404: { status: 404 },
})

// --- fail pairs a tag with its fields ---------------------------------------

const fail = route({
  'order-not-found': { status: 404, schema: z.object({ id: z.number() }) },
  'order-locked': { status: 409 },
})

export const undeclaredTag = fail('order-unknown')
export const reservedThroughFail = fail('validation-failed')
export const missingFields = fail('order-not-found')
export const wrongField = fail('order-not-found', { id: 'seven' })
export const fieldsWithoutSchema = fail('order-locked', { id: 7 })

// An untyped schema's output is `any`, and the runtime still demands its
// fields object.
declare const untypedSchema: StandardSchemaV1<any, any>
const failUntyped = route({ untyped: { status: 400, schema: untypedSchema } })

export const untypedWithoutFields = failUntyped('untyped')

// A schema typed optional is still a schema when the entry holds one.
const orderRef = z.object({ id: z.number() })

interface OptionalSchemaEntry {
  readonly status: 400
  readonly schema?: typeof orderRef
}

const optionalEntry: OptionalSchemaEntry = { status: 400, schema: orderRef }
const failOptional = route({ optional: optionalEntry })

export const optionalWithoutFields = failOptional('optional')

const annotatedEntry: ErrorEntry = {
  status: 400,
  schema: z.object({ id: z.number() }),
}
const failAnnotated = route({ annotated: annotatedEntry })

export const annotatedWithoutFields = failAnnotated('annotated')

// --- narrowing is Pick ------------------------------------------------------

const common = {
  ...defineError('unauthorized', { status: 401 }),
  ...defineError('forbidden', {
    status: 403,
    schema: z.object({ role: z.string() }),
  }),
}

const onlyUnauthorized: Pick<typeof common, 'unauthorized'> = common
const failNarrowed = route(onlyUnauthorized)

export const pickedAway = failNarrowed('forbidden', { role: 'admin' })
