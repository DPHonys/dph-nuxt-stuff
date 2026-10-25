/**
 * The io half's request side: a route's `input` resolved once into a plan
 * when the route module is evaluated, and run against every request before
 * the Handler is entered.
 */

import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { H3Event } from 'h3'
import {
  isPlainObject,
  isRecordLike,
  isStandardSchema,
} from '../../shared/guards'
import { VALIDATION_SOURCES } from '../../shared/io/sources'
import type {
  InputDeclaration,
  SourceSchemas,
  SourceValue,
  ValidatedContext,
  ValidationSource,
} from '../../types/io/input'
import {
  declarationFault,
  describeRoute,
  describeValue,
  developerFault,
} from '../faults'
import type { OnInvalid } from './issues'
import { projectIssues } from './issues'
import type { RawSource, SourceReader } from './sources'
import { SOURCE_WALK } from './sources'

// Module-private and never assigned: the slot a step carries at the type
// level only, so a plan remembers which declaration it was resolved from.
declare const declaredInput: unique symbol

/**
 * One declared source, resolved: its reader and its schemas. The schemas are
 * always a list - a bare slot is its own one-element list, settled here so
 * nothing downstream asks which form the author wrote - but `composed`
 * remembers the form, so a sentence names an element by its index only when
 * the author wrote a tuple. The declaration rides along as `Input`, which is
 * what lets `validatedContext` type what it hands back.
 */
export interface SourceStep<Input extends InputDeclaration = InputDeclaration> {
  readonly source: ValidationSource
  readonly read: SourceReader
  readonly schemas: readonly [StandardSchemaV1, ...StandardSchemaV1[]]
  readonly composed: boolean
  readonly [declaredInput]?: Input
}

// Membership only; `SOURCE_WALK` is what states the order.
const SOURCE_NAMES: ReadonlySet<string> = new Set<string>(VALIDATION_SOURCES)

/** The slot's schemas, each checked, or the declaration fault it breaks. */
function slotSchemas(
  source: ValidationSource,
  slot: SourceSchemas
): readonly [StandardSchemaV1, ...StandardSchemaV1[]] {
  // Checked anyway, though typed as schemas already: the callers this
  // catches are exactly the ones the types never saw.
  if (!Array.isArray(slot)) {
    if (isStandardSchema(slot)) return [slot]

    throw declarationFault(
      `The ${source} input must be a Standard Schema or a non-empty tuple of them, not ${describeValue(slot)}.`
    )
  }

  // Flattened rather than read off `slot`, which `Array.isArray` cannot
  // narrow out of the union to a readonly tuple without a cast.
  const [first, ...rest] = [slot].flat()

  if (first === undefined) {
    throw declarationFault(
      `The ${source} input is an empty tuple. Declare at least one schema, or remove the key.`
    )
  }

  for (const [position, element] of [first, ...rest].entries()) {
    if (!isStandardSchema(element)) {
      throw declarationFault(
        `The ${source} input holds ${describeValue(element)} at index ${position}, which is not a Standard Schema.`
      )
    }
  }

  return [first, ...rest]
}

/**
 * Resolve a route's `input` once, when the route module is evaluated,
 * throwing a declaration fault at the first rule it breaks: a key that names
 * no Validation source, then a slot holding something that is not a Standard
 * Schema. A slot left `undefined` declares nothing. Walking `SOURCE_WALK`
 * rather than the declaration's own keys is what makes the fail-fast order
 * the package's promise instead of the author's key order.
 */
export function sourcePlan<Input extends InputDeclaration>(
  input: Input
): readonly SourceStep<Input>[] {
  if (!isRecordLike(input)) {
    throw declarationFault(
      `The input of defineBetterEventHandler must be a map of schemas keyed by validation source, not ${describeValue(input)}.`
    )
  }

  // Ahead of the walk, because the walk visits the four sources rather than
  // the author's keys: a stray key is never looked at there, so the route
  // would serve with what the author believed they had declared unvalidated.
  for (const key of Object.keys(input)) {
    if (SOURCE_NAMES.has(key)) continue

    throw declarationFault(
      `The input declares "${key}", which is not a validation source - the sources are route, query, headers and body.`
    )
  }

  const declaration: InputDeclaration = input
  const plan: SourceStep<Input>[] = []

  for (const [source, read] of SOURCE_WALK) {
    const slot = declaration[source]

    if (slot === undefined) continue

    plan.push({
      source,
      read,
      schemas: slotSchemas(source, slot),
      composed: Array.isArray(slot),
    })
  }

  return plan
}

// The slot a plan's step was resolved from, as far as the type can tell: any
// of the declaration's slots. Which one is the step's own `source` to say.
type DeclaredSlot<Input extends InputDeclaration> = Extract<
  Input[ValidationSource],
  SourceSchemas
>

/** The element a sentence names: by index in a tuple, plainly otherwise. */
function describeElement(step: SourceStep, position: number): string {
  return step.composed ? `the schema at index ${position}` : 'the schema'
}

/**
 * Run one request through the plan, in the plan's order, stopping at the
 * first source that fails. Every client-input rejection goes through
 * `onInvalid`; a schema that answers with neither a value nor an issue, and
 * outputs a tuple cannot merge, are developer faults instead. Hands back a
 * fresh object holding one key per declared source.
 */
export async function validatedContext<Input extends InputDeclaration>(
  event: H3Event,
  plan: readonly SourceStep<Input>[],
  onInvalid: OnInvalid
): Promise<ValidatedContext<Input>> {
  const validated: {
    [Source in ValidationSource]?: SourceValue<DeclaredSlot<Input>>
  } = {}

  for (const step of plan) {
    validated[step.source] = await validatedValueFor<DeclaredSlot<Input>>(
      event,
      step,
      await step.read(event, onInvalid),
      onInvalid
    )
  }

  // SAFETY: `plan` came from `sourcePlan` over this `Input`, so its steps are
  // exactly the declared sources, each paired with its own slot's schemas;
  // the loop above filled one key per step with that slot's validated value.
  // That is what `ValidatedContext<Input>` reads off `Input` key by key - the
  // compiler only sees the union of every slot's value under every key.
  return validated as ValidatedContext<Input>
}

/**
 * One source's validated value. Sequential rather than `Promise.all`, so
 * async schemas run in the order the author can predict from the tuple they
 * wrote. An element's failure does not stop the ones after it: fail-fast is a
 * rule across sources, so within one source every issue arrives together.
 *
 * `Slot` cannot be inferred: the plan flattened it away. The caller names the
 * slot the schemas were resolved from.
 */
async function validatedValueFor<Slot extends SourceSchemas>(
  event: H3Event,
  step: SourceStep,
  raw: RawSource,
  onInvalid: OnInvalid
): Promise<SourceValue<Slot>> {
  const issues: StandardSchemaV1.Issue[] = []
  const outputs: StandardSchemaV1.SuccessResult<unknown>[] = []
  let unreportedAt: number | undefined

  for (const [position, schema] of step.schemas.entries()) {
    const result = await schema['~standard'].validate(raw)

    // Discriminated on `issues`, never on `'value' in result`: a successful
    // result whose output is `undefined` may carry no `value` key at all.
    if (result.issues === undefined) {
      outputs.push(result)
      continue
    }

    // Remembered rather than raised here: the elements after it still run,
    // and a sibling with something real to report is the better answer.
    if (result.issues.length === 0) unreportedAt ??= position
    else issues.push(...result.issues)
  }

  // Projected before the door sees them: raw issues never leave this file.
  if (issues.length > 0)
    onInvalid(step.source, projectIssues(step.source, issues))

  if (unreportedAt !== undefined) {
    throw developerFault(
      `cannot validate the ${step.source} of ${describeRoute(event)}: ${describeElement(step, unreportedAt)} reported a failure with no issues. ` +
        'A Standard Schema answers with a value or with at least one issue, so this result names neither a value to hand the Handler nor a reason to reject the request.'
    )
  }

  return mergeOutputs<Slot>(event, step, outputs)
}

/**
 * A source's outputs as one value. A lone element, bare or a tuple of one,
 * has nothing to merge into, so its output passes through untouched, a
 * primitive included. A tuple's
 * merge is later-wins in tuple order, with no overlap detection: paying for
 * one on every request to re-check what the declaration guard already
 * refused would be the wrong trade.
 */
function mergeOutputs<Slot extends SourceSchemas>(
  event: H3Event,
  step: SourceStep,
  outputs: readonly StandardSchemaV1.SuccessResult<unknown>[]
): SourceValue<Slot> {
  const [lone, ...rest] = outputs

  if (lone !== undefined && rest.length === 0) {
    // SAFETY: a lone element's success - a bare schema's or a one-element
    // tuple's - carries its own `InferOutput`, which is `SourceValue<Slot>` as
    // it stands.
    return lone.value as SourceValue<Slot>
  }

  const merged = {}

  for (const [position, { value }] of outputs.entries()) {
    // A null prototype passes, because h3's form-urlencoded body has one;
    // anything with a prototype of its own - an array, a `Date`, a class
    // instance - carries meaning outside its enumerable keys, which a merge
    // would drop.
    if (!isPlainObject(value)) {
      throw developerFault(
        `cannot merge the validated ${step.source} of ${describeRoute(event)}: the schema at index ${position} produced ${describeValue(value)}. ` +
          'Schemas composed on one source merge their outputs, so every element of the tuple must produce a plain object.'
      )
    }

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

  // SAFETY: `outputs` holds one success per element of `Slot`, in tuple
  // order (a failing element answered through `onInvalid` before this), and
  // every output was a plain object; their later-wins merge in tuple order is
  // what `MergedOutput` spells for `Slot`.
  return merged as SourceValue<Slot>
}
