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
 *
 * It is also where a slot holding something that is not a schema is refused.
 * That is the one malformed declaration knowable without a request, so it is
 * answered here - once, loudly - instead of becoming an unattributed
 * `TypeError: Cannot read properties of null (reading '~standard')` on every
 * request the route ever serves.
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
    const elements = [slot].flat()

    // Typed as schemas already, checked anyway: the callers this catches are
    // exactly the ones the types never saw.
    for (const [position, element] of elements.entries()) {
      if (!isStandardSchema(element)) raiseUnschemaedSource(source, position)
    }

    plan.push({ source, read, schemas: elements })
  }

  return plan
}

/**
 * A slot element the request-time walk could call `~standard.validate` on.
 *
 * The whole contract is that one property, so that is the whole test: this is
 * not a validity check on a schema library's object, only the difference
 * between a schema and a `null`, a string or a bare options object that the
 * types would have refused.
 */
function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  if (typeof value !== 'object' || value === null) return false
  if (!('~standard' in value)) return false

  const standard: unknown = value['~standard']

  return (
    typeof standard === 'object' &&
    standard !== null &&
    'validate' in standard &&
    typeof standard.validate === 'function'
  )
}

/**
 * A source slot holding something that cannot validate anything - from the
 * callers the types cannot see, since the slot type admits only schemas.
 *
 * Raised **at route evaluation**, and that placement is the point: the mistake
 * is in the declaration, so it belongs to the file that wrote it rather than to
 * whichever request happens to arrive first. A plain `Error` rather than the
 * `500`s below, for the same reason - there is no request to answer, and the
 * route never becomes servable in the first place.
 */
function raiseUnschemaedSource(
  source: ValidationSource,
  position: number
): never {
  throw new Error(
    `[nuxt-handler-validation] cannot validate ${source}: the value at index ${position} is not a Standard Schema. ` +
      `A source slot holds a schema or a non-empty tuple of them - every element must carry a '~standard' property.`
  )
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
 *
 * **Every element owes exactly one output.** An element that delivers neither
 * an output nor an issue is the one thing this loop may not let past: its
 * contribution would vanish from the merge and the request would answer `200`
 * with data missing from it.
 */
async function validatedValueFor(
  source: ValidationSource,
  schemas: readonly StandardSchemaV1[],
  raw: unknown
): Promise<unknown> {
  const issues: StandardSchemaV1.Issue[] = []
  const outputs: unknown[] = []
  let unreportedAt: number | undefined

  for (const [position, schema] of schemas.entries()) {
    const result = await schema['~standard'].validate(raw)

    // Discriminated on `issues`, never on `'value' in result`: a successful
    // result whose output is `undefined` may carry no `value` key at all.
    if (result.issues === undefined) {
      outputs.push(result.value)
      continue
    }

    // A failure carrying no issue is neither branch of the interface - no
    // output for the merge, no reason for the client. Remembered rather than
    // raised here, because the elements after it still run and a sibling with
    // something real to report is the answer the client should get.
    if (result.issues.length === 0) unreportedAt ??= position
    else issues.push(...result.issues)
  }

  if (issues.length > 0) raiseValidationError(source, issues)
  if (unreportedAt !== undefined) raiseUnreportedFailure(source, unreportedAt)

  // Nothing failed and every element contributed, so an output's position in
  // this array is its element's position in the tuple - which is what lets the
  // merge name the offender.
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
 *
 * **Zero elements is not an empty merge.** No contribution would spread into
 * `{}`, and handing that to the handler would claim a source validated that
 * nothing ever looked at.
 */
function mergeOutputs(
  source: ValidationSource,
  outputs: readonly unknown[]
): unknown {
  if (outputs.length === 0) raiseUnvalidatedSource(source)
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
 * The one shape every request-time developer mistake below takes: a plain
 * `500` carrying a sentence, no issues payload and, above all, **no marker**.
 * An observability hook that skips validation failures must still report every
 * one of these, which is the entire point of the marker being on the `400`
 * alone.
 *
 * They are latent by nature. Such a route serves `200`s until a request
 * reaches the case, and hoisting them is impossible - what a schema answers is
 * unknowable without running it. The declaration guard closes the cases it can
 * see; these close the rest.
 */
function raiseSourceFault(message: string): never {
  throw createError({
    statusCode: 500,
    message: `[nuxt-handler-validation] ${message}`,
  })
}

/**
 * The runtime half of the composition rules: an element that produced
 * something there is no honest way to merge.
 */
function raiseUnmergeableOutput(
  source: ValidationSource,
  position: number,
  value: unknown
): never {
  raiseSourceFault(
    `cannot merge the validated ${source}: the schema at index ${position} produced ${describeValue(value)}. ` +
      `Schemas composed on one source merge their outputs, so every element of the tuple must produce a plain object.`
  )
}

/**
 * A schema that answered neither way: an `issues` array with nothing in it.
 *
 * The interface permits the shape - a failure result is only
 * `{ issues: ReadonlyArray<Issue> }` - but it names no output to deliver and
 * no reason to send a client, so it is a broken schema rather than a rejected
 * request. Reading it as a success would invent a value; reading it as a
 * failure would answer `400` with an empty payload - and that answer carries
 * the marker, which would let an observability hook skip the route's own bug.
 * It takes the unmarked `500` instead.
 */
function raiseUnreportedFailure(
  source: ValidationSource,
  position: number
): never {
  raiseSourceFault(
    `cannot deliver the validated ${source}: the schema at index ${position} reported a failure with no issues. ` +
      `A Standard Schema answers with a value or with at least one issue, so this result names neither an output to deliver nor a reason to reject the request.`
  )
}

/**
 * A declared source no schema ran for - an empty tuple, from the callers the
 * types cannot see. The slot type is a *non-empty* tuple, so a typed
 * declaration cannot reach here.
 *
 * The handler's second parameter is the door to validated values, and a source
 * standing behind it that nothing validated is the same silent loss the merge
 * refuses one element at a time. Undeclaring the source is the fix: an absent
 * key is absent from the second parameter, which is a compile error at the read
 * instead of an empty object at request time.
 */
function raiseUnvalidatedSource(source: ValidationSource): never {
  raiseSourceFault(
    `cannot deliver the validated ${source}: no schema ran for it. ` +
      `A source slot holds a schema or a non-empty tuple of them - remove the key instead of declaring it empty.`
  )
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
