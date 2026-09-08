import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { H3Event } from 'h3'
import { createError } from 'h3'
import { z } from 'zod'
import type {
  SourceSchemas,
  SourceValue,
  ValidatedContext,
  ValidationSchemas,
  ValidationSource,
} from '../../types'
import type { OnInvalid } from './issues'
import { projectIssues, raiseValidationError } from './issues'
import type { RawSource, SourceReader } from './sources'
import { SOURCE_WALK } from './sources'

// Module-private and never assigned: the slot a step carries at the type level
// only, so a plan remembers which declaration it was resolved from.
declare const declaredSchemas: unique symbol

/**
 * One resolved source slot: its reader and its schema list. The schemas are
 * always a list - a bare slot is its own one-element list, settled here so
 * nothing downstream asks which shape the author wrote. The list is erased to
 * `StandardSchemaV1[]`; the declaration it came from rides along as `S`, which
 * is what lets `validatedContext` type what it hands back.
 */
export interface SourcePlan<S extends ValidationSchemas = ValidationSchemas> {
  readonly source: ValidationSource
  readonly read: SourceReader
  readonly schemas: readonly StandardSchemaV1[]
  readonly [declaredSchemas]?: S
}

// Not a validity check on a schema library's object: only the difference
// between a schema and the `null`, string or options object the types refused.
const STANDARD_SCHEMA = z.looseObject({
  '~standard': z.looseObject({ validate: z.function() }),
})

function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  return STANDARD_SCHEMA.safeParse(value).success
}

/**
 * Resolve a declaration, once, when the route file is evaluated. Walking
 * `SOURCE_WALK` rather than the declaration's own keys is what makes the
 * fail-fast order the package's promise instead of the author's key order.
 */
export function sourcePlan<S extends ValidationSchemas>(
  schemas: S
): readonly SourcePlan<S>[] {
  const declaration: ValidationSchemas = schemas
  const plan: SourcePlan<S>[] = []

  for (const [source, read] of SOURCE_WALK) {
    const slot = declaration[source]

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

/** What a caller may swap in per request; the parent passes nothing. */
export interface ValidatedContextOptions {
  /** Defaults to `raiseValidationError`. */
  readonly onInvalid?: OnInvalid
}

// The slot a plan's step was resolved from, as far as the type can tell: any
// of the declaration's slots. Which one is the step's own `source` to say.
type DeclaredSlot<S extends ValidationSchemas> = Extract<
  S[ValidationSource],
  SourceSchemas
>

/**
 * Run one request through the plan, in the plan's order. Every client-input
 * rejection - a rejecting schema and an unparseable body alike - goes through
 * `onInvalid`; the developer-mistake `500`s never do.
 */
export async function validatedContext<S extends ValidationSchemas>(
  event: H3Event,
  plan: readonly SourcePlan<S>[],
  options: ValidatedContextOptions = {}
): Promise<ValidatedContext<S>> {
  const onInvalid = options.onInvalid ?? raiseValidationError
  const validated: {
    [K in ValidationSource]?: SourceValue<DeclaredSlot<S>>
  } = {}

  for (const { source, read, schemas } of plan) {
    validated[source] = await validatedValueFor<DeclaredSlot<S>>(
      source,
      schemas,
      await read(event, onInvalid),
      onInvalid
    )
  }

  // SAFETY: `plan` came from `sourcePlan` over this `S`, so its steps are
  // exactly the declared sources, each paired with its own slot's schemas; the
  // loop above filled one key per step with that slot's delivered value. That
  // is what `ValidatedContext<S>` reads off `S` key by key - TS only sees the
  // union of every slot's value under every key.
  return validated as ValidatedContext<S>
}

// Sequential rather than `Promise.all`, so async schemas run in the order the
// author can predict from the tuple they wrote. An early element's failure does
// not stop the later ones: fail-fast is a rule across sources, so within one
// source every issue arrives together in the one `400`.
//
// `Slot` cannot be inferred: the plan flattened it away. The caller names the
// slot the schemas were resolved from, and the delivery below states why the
// value is that slot's.
async function validatedValueFor<Slot extends SourceSchemas>(
  source: ValidationSource,
  schemas: readonly StandardSchemaV1[],
  raw: RawSource,
  onInvalid: OnInvalid
): Promise<SourceValue<Slot>> {
  const issues: StandardSchemaV1.Issue[] = []
  const outputs: StandardSchemaV1.SuccessResult<unknown>[] = []
  let unreportedAt: number | undefined

  for (const [position, schema] of schemas.entries()) {
    const result = await schema['~standard'].validate(raw)

    // Discriminated on `issues`, never on `'value' in result`: a successful
    // result whose output is `undefined` may carry no `value` key at all.
    if (result.issues === undefined) {
      outputs.push(result)
      continue
    }

    // Remembered rather than raised here: the elements after it still run, and
    // a sibling with something real to report is the better answer.
    if (result.issues.length === 0) unreportedAt ??= position
    else issues.push(...result.issues)
  }

  // Projected before the hook sees them: raw issues never cross the seam.
  if (issues.length > 0) onInvalid(source, projectIssues(source, issues))
  if (unreportedAt !== undefined) raiseUnreportedFailure(source, unreportedAt)

  // Every element contributed, so an output's position here is its element's
  // position in the tuple - which is what lets the merge name the offender.
  return mergeOutputs<Slot>(source, outputs)
}

// Later-wins spread, in tuple order: no overlap detection, because paying for
// one on every request to re-check what the declaration guard already refused
// would be the wrong trade. A lone element has nothing to merge into, so its
// output passes through untouched, a primitive included.
function mergeOutputs<Slot extends SourceSchemas>(
  source: ValidationSource,
  outputs: readonly StandardSchemaV1.SuccessResult<unknown>[]
): SourceValue<Slot> {
  const [lone, ...rest] = outputs

  if (lone === undefined) raiseUnvalidatedSource(source)

  if (rest.length === 0) {
    // SAFETY: a lone element's success carries its own `InferOutput`, which
    // is `SourceValue<Slot>` as it stands.
    return lone.value as SourceValue<Slot>
  }

  const merged = {}

  for (const [position, output] of outputs.entries()) {
    if (!isPlainObject(output.value)) {
      raiseUnmergeableOutput(source, position, output)
    }

    // Defined rather than assigned, so a `__proto__` key lands as an own
    // property instead of calling the setter that would swap the merged
    // object's prototype. h3's readers drop that key before this point; the
    // guarantee is held here rather than borrowed from them.
    for (const [key, entry] of Object.entries(output.value)) {
      Object.defineProperty(merged, key, {
        value: entry,
        writable: true,
        enumerable: true,
        configurable: true,
      })
    }
  }

  // SAFETY: `outputs` holds one success per element of `Slot`, in tuple
  // order; every output was a plain object (refused otherwise), and their
  // later-wins merge in tuple order is what `MergedOutput` spells for `Slot`.
  return merged as SourceValue<Slot>
}

// Anything with a prototype of its own (an array, a `Date`, a class instance)
// carries meaning outside its enumerable keys, which a spread would drop. A
// null prototype passes, because h3's form-urlencoded body has one.
function isPlainObject(value: unknown): value is object {
  if (value === null || value === undefined) return false

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
  output: StandardSchemaV1.SuccessResult<unknown>
): never {
  raiseSourceFault(
    `cannot merge the validated ${source}: the schema at index ${position} produced ${describeOutput(output)}. ` +
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

// The shapes an author is likely to have produced, named; a class instance by
// its class, since "an object" is what they believed they returned.
function describeOutput({
  value,
}: StandardSchemaV1.SuccessResult<unknown>): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return 'an array'
  if (value instanceof Object) {
    return `an instance of ${value.constructor.name || 'an anonymous class'}`
  }

  return `the primitive ${String(value)}`
}
