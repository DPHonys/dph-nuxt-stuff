import type { StandardSchemaV1 } from '@standard-schema/spec'
import { createError } from 'h3'
import type { ValidationFragment } from '../../types/composition'
import type { ValidateSchemas, ValidationSource } from '../../types/schemas'
import { raiseValidationError } from './issues'

/** One fragment's schema for one source, with the fragment's own position. */
interface SourceDeclaration {
  readonly index: number
  readonly schema: StandardSchemaV1
}

/** One fragment's validated output for one source, and where it came from. */
interface SourceOutput {
  readonly index: number
  readonly value: unknown
}

// Its own predicate rather than a bare `Array.isArray` call: `isArray` narrows
// to the mutable `any[]`, which leaves a `readonly` array in the other branch
// of this union and nothing narrowed at all.
function isComposed(
  options: ValidateSchemas | readonly ValidationFragment[]
): options is readonly ValidationFragment[] {
  return Array.isArray(options)
}

/**
 * The declaration as a list of fragments, whichever form it arrived in: the
 * flat object is the one-fragment case of the composed array, so everything
 * downstream has a single shape to walk.
 */
export function fragmentsOf(
  options: ValidateSchemas | readonly ValidationFragment[]
): readonly ValidationFragment[] {
  return isComposed(options) ? options : [options]
}

/**
 * Which fragments declare a source, in array order, each remembering where it
 * sat - the index is what lets a merge failure name the fragment that produced
 * the offending value.
 */
export function declarationsFor(
  fragments: readonly ValidationFragment[],
  source: ValidationSource
): SourceDeclaration[] {
  const declarations: SourceDeclaration[] = []

  for (const [index, fragment] of fragments.entries()) {
    const schema = fragment[source]

    if (schema !== undefined) declarations.push({ index, schema })
  }

  return declarations
}

/**
 * Validate one source against every fragment that declared it, and deliver the
 * one value the handler receives for it.
 *
 * Every fragment runs - composing sets composes their validations - and all of
 * them see the same raw source value, read once. Their issues aggregate, so a
 * source rejected by two fragments answers with both fragments' issues in one
 * response; fail-fast applies between sources, never between one source's
 * fragments.
 */
export async function validatedValueFor(
  source: ValidationSource,
  declarations: readonly SourceDeclaration[],
  raw: unknown
): Promise<unknown> {
  const issues: StandardSchemaV1.Issue[] = []
  const outputs: SourceOutput[] = []

  for (const { index, schema } of declarations) {
    const result = await schema['~standard'].validate(raw)

    // Discriminated on `issues`, never on `'value' in result`: a successful
    // result whose output is `undefined` may carry no `value` key at all.
    if (result.issues === undefined) {
      outputs.push({ index, value: result.value })
    } else {
      issues.push(...result.issues)
    }
  }

  if (issues.length > 0) raiseValidationError(source, issues)

  return mergeOutputs(source, outputs)
}

/**
 * The source's contributions as one value: a lone output passes through
 * untouched - a primitive included, since there is nothing to merge it into -
 * and several shallow-merge in array order, so a key two fragments produce is
 * **later-wins**.
 *
 * Later-wins rather than the sibling's first-wins, deliberately: it matches
 * spread intuition and `Object.assign`, and nothing is lost by it either way,
 * because every fragment has already run.
 */
function mergeOutputs(
  source: ValidationSource,
  outputs: readonly SourceOutput[]
): unknown {
  if (outputs.length === 1) return outputs[0]?.value

  const merged: Record<string, unknown> = {}

  for (const { index, value } of outputs) {
    if (!isPlainObject(value)) raiseUnmergeableOutput(source, index, value)

    Object.assign(merged, value)
  }

  return merged
}

// A plain object and nothing else - the same line the type draws, so the
// runtime never accepts what the compiler poisons. Anything with a prototype
// of its own (an array, a `Date`, a class instance) carries its meaning outside
// its own enumerable keys, and `Object.assign` would take those keys and drop
// the meaning: a contribution silently lost is the failure this whole error
// exists to prevent. A null prototype passes, because h3's form-urlencoded body
// has one.
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false

  const prototype: unknown = Object.getPrototypeOf(value)

  return prototype === Object.prototype || prototype === null
}

/**
 * The one collision this package cannot write a total rule for, so the one it
 * errors on: a source several fragments contribute to, where one of them
 * produced something there is no honest way to merge.
 *
 * A plain `500` - a mis-declaration, not a client mistake. No issues payload
 * and no marker, so an observability hook that skips validation failures still
 * reports this one, which is the point: it is a bug in the route.
 *
 * It is latent by nature: such a route serves `200`s until a request parses
 * cleanly into a non-object. Hoisting it is impossible - an output's shape is
 * unknowable without a parse - and the only way to remove the latency is to
 * ban multi-fragment sources, which is the feature.
 */
function raiseUnmergeableOutput(
  source: ValidationSource,
  index: number,
  value: unknown
): never {
  throw createError({
    statusCode: 500,
    message:
      `[nuxt-handler-validation] cannot merge the validated ${source}: fragment ${index} produced ${describeValue(value)}. ` +
      `A source declared by more than one fragment merges their outputs, so every one of them must be a plain object.`,
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
