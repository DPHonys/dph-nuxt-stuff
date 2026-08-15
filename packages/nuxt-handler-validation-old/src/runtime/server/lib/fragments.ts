import type { StandardSchemaV1 } from '@standard-schema/spec'
import { createError } from 'h3'
import type { ValidationSource } from '../../types/schemas'
import type { SourceDeclaration } from './declaration'
import { raiseValidationError } from './issues'

/**
 * What can only happen once a request exists: running a source's schemas and
 * merging what they produced. Its counterpart is `declaration.ts`, which
 * settles everything that does not need a request at all.
 */

/** One fragment's validated output for one source, and where it came from. */
interface SourceOutput {
  readonly index: number
  readonly name: string | undefined
  readonly value: unknown
}

/** The same, once it is known to have come from a named set. */
interface NamedOutput extends SourceOutput {
  readonly name: string
}

function isNamed(output: SourceOutput): output is NamedOutput {
  return output.name !== undefined
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

  for (const { index, name, schema } of declarations) {
    const result = await schema['~standard'].validate(raw)

    // Discriminated on `issues`, never on `'value' in result`: a successful
    // result whose output is `undefined` may carry no `value` key at all.
    if (result.issues === undefined) {
      outputs.push({ index, name, value: result.value })
    } else {
      issues.push(...result.issues)
    }
  }

  if (issues.length > 0) raiseValidationError(source, issues)

  return mergeOutputs(source, outputs)
}

/**
 * The source's contributions as one value, in **two phases**: the unnamed
 * outputs shallow-merge in array order, and only then are the named ones
 * assigned under their set names.
 *
 * The order is the rule. Merging unnamed first makes a set name meeting an
 * unnamed output key **named-wins**, deterministically and wherever the named
 * set sits in the array - so a route's shape does not depend on the order sets
 * were spread in. Among the unnamed outputs themselves, a key two of them
 * produce is **later-wins**: spread intuition and `Object.assign`, and nothing
 * is lost either way, because every fragment has already run.
 *
 * A lone unnamed output with no named layer to carry passes through untouched,
 * a primitive included - there is nothing to merge it into. A named output
 * needs no merge legality at all, whatever its shape: it is assigned under its
 * own key rather than spread into anything.
 */
function mergeOutputs(
  source: ValidationSource,
  outputs: readonly SourceOutput[]
): unknown {
  const named: NamedOutput[] = []
  const unnamed: SourceOutput[] = []

  for (const output of outputs) {
    if (isNamed(output)) named.push(output)
    else unnamed.push(output)
  }

  if (named.length === 0 && unnamed.length === 1) return unnamed[0]?.value

  const merged: Record<string, unknown> = {}

  for (const { index, value } of unnamed) {
    if (!isPlainObject(value)) raiseUnmergeableOutput(source, index, value)

    Object.assign(merged, value)
  }

  for (const { name, value } of named) merged[name] = value

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
