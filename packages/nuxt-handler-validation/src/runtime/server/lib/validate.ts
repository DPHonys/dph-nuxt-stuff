import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { H3Event } from 'h3'
import type { ValidationSchemas, ValidationSource } from '../../types'
import { raiseValidationError } from './issues'
import type { SourceReader } from './sources'
import { SOURCE_WALK } from './sources'

/**
 * The mechanics behind `defineValidatedEventHandler`: what a declaration
 * settles once, and what one request then does with it.
 */

/**
 * A declared source: how it comes off the event, and what validates it.
 * Sources the declaration left out are absent, so the request-time walk has
 * nothing to skip.
 */
interface SourcePlan {
  readonly source: ValidationSource
  readonly read: SourceReader
  readonly schema: StandardSchemaV1
}

/**
 * Resolve a declaration, once, when the route file is evaluated.
 *
 * Which sources a route declares, what validates each of them and in which
 * order they run are not per-request questions, and a route serving thousands
 * of requests should answer them none of those times. Walking `SOURCE_WALK`
 * rather than the declaration's own keys is what makes the fail-fast order the
 * package's promise instead of the author's key order.
 */
export function sourcePlan(schemas: ValidationSchemas): readonly SourcePlan[] {
  const plan: SourcePlan[] = []

  for (const [source, read] of SOURCE_WALK) {
    const slot = schemas[source]

    if (slot === undefined) continue

    // A slot may also hold a tuple of schemas - the composition model - whose
    // elements are delivered as one merged value. Until that merge exists, the
    // slot is the lone schema it holds.
    plan.push({ source, read, schema: slot as StandardSchemaV1 })
  }

  return plan
}

/**
 * Run one request through the plan and produce the handler's second parameter.
 *
 * Fail-fast is what the raise inside this loop *is*: it leaves the walk before
 * any later source is read, so a bad route param never costs a body parse.
 * Every declared source is read exactly once, and every validated value is
 * produced eagerly - the second parameter is the door to them, and it is
 * complete by the time the handler body starts.
 */
export async function validatedContext(
  event: H3Event,
  plan: readonly SourcePlan[]
): Promise<Record<string, unknown>> {
  const validated: Record<string, unknown> = {}

  for (const { source, read, schema } of plan) {
    validated[source] = await validatedValueFor(
      source,
      schema,
      await read(event)
    )
  }

  return validated
}

/**
 * Validate one source and deliver the value the handler receives for it.
 *
 * A schema's own `validate` is awaited, so an async Standard Schema is no
 * special case; whatever it rejects arrives as one `400` carrying **all** of
 * that schema's issues, because a form with two bad fields should not need two
 * round trips.
 */
async function validatedValueFor(
  source: ValidationSource,
  schema: StandardSchemaV1,
  raw: unknown
): Promise<unknown> {
  const result = await schema['~standard'].validate(raw)

  // Discriminated on `issues`, never on `'value' in result`: a successful
  // result whose output is `undefined` may carry no `value` key at all.
  if (result.issues !== undefined) raiseValidationError(source, result.issues)

  return result.value
}
