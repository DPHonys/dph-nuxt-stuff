import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { H3Event } from 'h3'
import { createError } from 'h3'
import type { ValidationSchemas, ValidationSource } from '../../types'
import { raiseValidationError } from './issues'
import type { SourceReader } from './sources'
import { SOURCE_WALK } from './sources'

// The schemas are always a list - a bare slot is its own one-element list,
// settled here so nothing downstream asks which shape the author wrote.
interface SourcePlan {
  readonly source: ValidationSource
  readonly read: SourceReader
  readonly schemas: readonly StandardSchemaV1[]
}

/**
 * Resolve a declaration, once, when the route file is evaluated. Walking
 * `SOURCE_WALK` rather than the declaration's own keys is what makes the
 * fail-fast order the package's promise instead of the author's key order.
 */
export function sourcePlan(schemas: ValidationSchemas): readonly SourcePlan[] {
  const plan: SourcePlan[] = []

  for (const [source, read] of SOURCE_WALK) {
    const slot = schemas[source]

    if (slot === undefined) continue

    // Flattened rather than tested with `Array.isArray`, which cannot narrow a
    // readonly tuple out of the union and would need a cast.
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

// Not a validity check on a schema library's object: only the difference
// between a schema and the `null`, string or options object the types refused.
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

// A plain `Error` rather than the `500`s below: this fires at route evaluation,
// where there is no request to answer and the route never becomes servable.
function raiseUnschemaedSource(
  source: ValidationSource,
  position: number
): never {
  throw new Error(
    `[nuxt-handler-validation] cannot validate ${source}: the value at index ${position} is not a Standard Schema. ` +
      `A source slot holds a schema or a non-empty tuple of them - every element must carry a '~standard' property.`
  )
}

/** Run one request through the plan, in the plan's order. */
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

// Sequential rather than `Promise.all`, so async schemas run in the order the
// author can predict from the tuple they wrote. An early element's failure does
// not stop the later ones: fail-fast is a rule across sources, so within one
// source every issue arrives together in the one `400`.
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

    // Remembered rather than raised here: the elements after it still run, and
    // a sibling with something real to report is the better answer.
    if (result.issues.length === 0) unreportedAt ??= position
    else issues.push(...result.issues)
  }

  if (issues.length > 0) raiseValidationError(source, issues)
  if (unreportedAt !== undefined) raiseUnreportedFailure(source, unreportedAt)

  // Every element contributed, so an output's position here is its element's
  // position in the tuple - which is what lets the merge name the offender.
  return mergeOutputs(source, outputs)
}

// Later-wins spread, in tuple order: no overlap detection, because paying for
// one on every request to re-check what the declaration guard already refused
// would be the wrong trade. A lone element has nothing to merge into, so its
// output passes through untouched, a primitive included.
function mergeOutputs(
  source: ValidationSource,
  outputs: readonly unknown[]
): unknown {
  if (outputs.length === 0) raiseUnvalidatedSource(source)
  if (outputs.length === 1) return outputs[0]

  const merged: Record<string, unknown> = {}

  for (const [position, value] of outputs.entries()) {
    if (!isPlainObject(value)) raiseUnmergeableOutput(source, position, value)

    // Defined rather than assigned, so a `__proto__` key lands as an own
    // property instead of calling the setter that would swap the merged
    // object's prototype. h3's readers drop that key before this point; the
    // guarantee is held here rather than borrowed from them.
    for (const [key, entry] of Object.entries(value)) {
      Object.defineProperty(merged, key, {
        value: entry,
        writable: true,
        enumerable: true,
        configurable: true,
      })
    }
  }

  return merged
}

// Anything with a prototype of its own (an array, a `Date`, a class instance)
// carries meaning outside its enumerable keys, which a spread would drop. A
// null prototype passes, because h3's form-urlencoded body has one.
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false

  const prototype: unknown = Object.getPrototypeOf(value)

  return prototype === Object.prototype || prototype === null
}

// The shape every request-time developer mistake below takes: a plain `500`
// with no marker, so an observability hook that skips validation failures still
// reports it.
function raiseSourceFault(message: string): never {
  throw createError({
    statusCode: 500,
    message: `[nuxt-handler-validation] ${message}`,
  })
}

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

function raiseUnreportedFailure(
  source: ValidationSource,
  position: number
): never {
  raiseSourceFault(
    `cannot deliver the validated ${source}: the schema at index ${position} reported a failure with no issues. ` +
      `A Standard Schema answers with a value or with at least one issue, so this result names neither an output to deliver nor a reason to reject the request.`
  )
}

// An empty tuple, reachable only from the callers the types cannot see: the
// slot type is a non-empty tuple.
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
