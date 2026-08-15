import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { H3Event } from 'h3'
import { createError } from 'h3'
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
 *
 * The schemas are always a **list**, never "a schema or a list": a bare slot is
 * its own one-element list, settled here once, so nothing downstream has to ask
 * which shape the author wrote and `x` and `[x]` cannot drift apart.
 */
interface SourcePlan {
  readonly source: ValidationSource
  readonly read: SourceReader
  readonly schemas: readonly StandardSchemaV1[]
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

    // The one place a slot's two written shapes become one runtime shape: a
    // tuple is already the element list, and a bare schema is the list holding
    // it. Flattened rather than tested with `Array.isArray`, which cannot
    // narrow a *readonly* tuple out of the union and would need a cast to say
    // what this says exactly.
    plan.push({ source, read, schemas: [slot].flat() })
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

  for (const { source, read, schemas } of plan) {
    validated[source] = await validatedValueFor(
      source,
      schemas,
      await read(event)
    )
  }

  return validated
}

/**
 * Validate one source against every schema composed on it, and deliver the one
 * value the handler receives for it.
 *
 * Every element runs, **sequentially and in tuple order**, and every one of
 * them sees the same raw source, read once. Sequential rather than
 * `Promise.all`, so async schemas run in an order the author can predict from
 * the tuple they wrote.
 *
 * An early element's failure does not stop the later ones: fail-fast is a rule
 * *across* sources, so within one source every issue arrives together in the
 * one `400` - which is what makes reordering a tuple invisible to a client, and
 * what spares a form with two bad fields a second round trip. A schema's own
 * `validate` is awaited, so an async Standard Schema is no special case.
 */
async function validatedValueFor(
  source: ValidationSource,
  schemas: readonly StandardSchemaV1[],
  raw: unknown
): Promise<unknown> {
  const issues: StandardSchemaV1.Issue[] = []
  const outputs: unknown[] = []

  for (const schema of schemas) {
    const result = await schema['~standard'].validate(raw)

    // Discriminated on `issues`, never on `'value' in result`: a successful
    // result whose output is `undefined` may carry no `value` key at all.
    if (result.issues === undefined) outputs.push(result.value)
    else issues.push(...result.issues)
  }

  if (issues.length > 0) raiseValidationError(source, issues)

  // Nothing failed, so an output's position in this array is its element's
  // position in the tuple - which is what lets the merge name the offender.
  return mergeOutputs(source, outputs)
}

/**
 * The source's element outputs as the one value the handler is handed: a plain
 * object spread, in tuple order.
 *
 * **Later-wins**, deliberately, for the overlaps the compile-time rule cannot
 * see - a plain-JS caller, an `any`-typed schema, a passthrough key riding into
 * an otherwise-disjoint merge. Spread intuition, at zero per-request cost:
 * there is no overlap detection here, because paying for one on every request
 * to re-check what the declaration already refused would be the wrong trade.
 *
 * A lone element has nothing to merge into, so its output passes through
 * **untouched** - a primitive or a union included. That is the whole of what
 * makes `x` and `[x]` the same declaration.
 */
function mergeOutputs(
  source: ValidationSource,
  outputs: readonly unknown[]
): unknown {
  if (outputs.length === 1) return outputs[0]

  const merged: Record<string, unknown> = {}

  for (const [position, value] of outputs.entries()) {
    if (!isPlainObject(value)) raiseUnmergeableOutput(source, position, value)

    Object.assign(merged, value)
  }

  return merged
}

// A plain object and nothing else - the same line the declaration guard draws,
// one step further. Anything with a prototype of its own (an array, a `Date`, a
// class instance) carries its meaning outside its own enumerable keys, and a
// spread would take those keys and drop the meaning: a contribution silently
// lost is the failure the raise below exists to prevent. A null prototype
// passes, because h3's form-urlencoded body has one.
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false

  const prototype: unknown = Object.getPrototypeOf(value)

  return prototype === Object.prototype || prototype === null
}

/**
 * The runtime half of the composition rules: an element that produced
 * something there is no honest way to merge.
 *
 * A plain `500` naming the source and the element's position - a developer
 * mistake, not a client's. No issues payload and, above all, **no marker**: an
 * observability hook that skips validation failures must still report this one,
 * which is the entire point of the marker being on the `400` alone.
 *
 * It is latent by nature. Such a route serves `200`s until a request parses
 * cleanly into a non-object, and hoisting it is impossible - an output's shape
 * is unknowable without a parse. The declaration guard closes the case it can
 * see; this closes the rest.
 */
function raiseUnmergeableOutput(
  source: ValidationSource,
  position: number,
  value: unknown
): never {
  throw createError({
    statusCode: 500,
    message:
      `[nuxt-handler-validation] cannot merge the validated ${source}: the schema at index ${position} produced ${describeValue(value)}. ` +
      `Schemas composed on one source merge their outputs, so every element of the tuple must produce a plain object.`,
  })
}

// `typeof` answers "object" for every shape this rejects, so the ones an author
// is likely to have produced are named instead.
function describeValue(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'an array'
  if (typeof value === 'object') {
    return `an instance of ${value.constructor?.name ?? 'an anonymous class'}`
  }

  return `a value of type ${typeof value}`
}
