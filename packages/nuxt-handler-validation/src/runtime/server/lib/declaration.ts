import type { StandardSchemaV1 } from '@standard-schema/spec'
import { VALIDATION_NAME } from '../../shared/name'
import type { ValidationFragment } from '../../types/composition'
import type { ValidateSchemas, ValidationSource } from '../../types/schemas'
import type { SourceReader } from './sources'
import { SOURCE_WALK } from './sources'

/**
 * Everything that can be settled when the route file is evaluated, and the two
 * malformed declarations refused there.
 *
 * Its counterpart is `fragments.ts`, which owns what can only happen once a
 * request exists: running the schemas and merging what they produced. Splitting
 * on that line is what keeps "resolved once" honest - nothing here can quietly
 * become per-request work.
 */

/** One fragment's schema for one source, with the fragment's own position. */
export interface SourceDeclaration {
  readonly index: number
  readonly name: string | undefined
  readonly schema: StandardSchemaV1
}

/**
 * Everything a declared source needs: how it comes off the event, and which
 * fragments validate it. Sources no fragment declares are absent, so the
 * request-time walk has nothing to skip.
 */
export interface SourcePlan {
  readonly source: ValidationSource
  readonly read: SourceReader
  readonly declarations: readonly SourceDeclaration[]
}

/**
 * Resolve a declaration, once, at declaration time.
 *
 * Nothing in this pass depends on a request, so a route serving thousands of
 * them should answer none of these questions again. That is also what makes the
 * two guards below free: both read names and shapes, which are known without
 * parsing anything.
 */
export function declarationPlan(
  options: ValidateSchemas | readonly ValidationFragment[]
): readonly SourcePlan[] {
  const fragments = fragmentsOf(options)
  const plan: SourcePlan[] = []

  for (const [source, read] of SOURCE_WALK) {
    const declarations = declarationsFor(fragments, source)

    if (declarations.length === 0) continue

    assertDistinctNames(source, declarations)
    plan.push({ source, read, declarations })
  }

  return plan
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
function fragmentsOf(
  options: ValidateSchemas | readonly ValidationFragment[]
): readonly ValidationFragment[] {
  if (isComposed(options)) return options
  if (isObjectSpreadGroup(options)) raiseObjectSpreadGroup()

  return [options]
}

// A group is a tuple, so object-spreading one leaves its fragments under array
// INDEX keys - and that is the whole runtime signature, because `length` is
// non-enumerable on an array and never survives the spread. (`length` is what
// the *type*-level guard reads, which is why the two guards look nothing alike.)
// No schema set has a numeric source, so this cannot mistake a real declaration
// for the mistake.
const ARRAY_INDEX = /^\d+$/

function isObjectSpreadGroup(options: ValidateSchemas): boolean {
  // Anything that is not an object is not a spread group; it is garbage this
  // guard has nothing to say about, and `Object.keys` would only turn it into
  // a `TypeError` that names the wrong problem.
  if (typeof options !== 'object' || options === null) return false

  return Object.keys(options).some((key) => ARRAY_INDEX.test(key))
}

/**
 * The mistake the types already reject, caught again for the callers they never
 * see: plain JS, and anything that reached here as `any`.
 *
 * Object spread keeps only the last group's fragment (numeric keys last-win),
 * so a route would claim two sets and hold one - and the set that vanished
 * would silently never validate anything. Defense in depth, not the only line.
 */
function raiseObjectSpreadGroup(): never {
  throw new Error(
    '[nuxt-handler-validation] validation groups compose with array spread, not object spread: write ' +
      'defineValidatedEventHandler([...pagination, ...sorting], ...) rather than { ...pagination, ...sorting }. ' +
      'Object spread keeps only the last group, so every set before it would silently never run.'
  )
}

/**
 * Two *different* sets cannot share a name on one source: the name is the key
 * that source's output nests under, so one of them would have to be dropped.
 *
 * A throw, deliberately, where the sibling's `byDistinctTag` answers the same
 * gap with a silent first-wins dedupe. Dropping a duplicate-tagged error
 * definition loses a declaration; dropping a same-named set on a source loses
 * **validation that was declared and would have run**. One name across several
 * sources is fine - each source is its own namespace.
 *
 * The comparison is on the **schema**, not on the name alone, and that is what
 * keeps the runtime from erroring where the compiler is silent. Spreading one
 * group twice (`[...common, ...pagination]`, where `common` already holds
 * `pagination`) puts the same name on the source twice, but the type collapses
 * the identical fragments and poisons nothing - correctly, since the same
 * schema runs and produces the same value either way. Throwing there would
 * manufacture exactly the hazard the design refused: a shape that compiles
 * clean and then fails at startup.
 */
function assertDistinctNames(
  source: ValidationSource,
  declarations: readonly SourceDeclaration[]
): void {
  const seen = new Map<string, StandardSchemaV1>()

  for (const { name, schema } of declarations) {
    if (name === undefined) continue

    const previous = seen.get(name)

    if (previous !== undefined && previous !== schema) {
      throw new Error(
        `[nuxt-handler-validation] two different validation sets are named "${name}" and both declare ${source}. ` +
          `A set name is the key its output nests under, so one of them could only be dropped - and dropping it ` +
          `would stop validation this route declared. Rename one of the sets.`
      )
    }

    seen.set(name, schema)
  }
}

/**
 * Which fragments declare a source, in array order, each remembering where it
 * sat - the index is what lets a merge failure name the fragment that produced
 * the offending value.
 */
function declarationsFor(
  fragments: readonly ValidationFragment[],
  source: ValidationSource
): SourceDeclaration[] {
  const declarations: SourceDeclaration[] = []

  for (const [index, fragment] of fragments.entries()) {
    const schema = fragment[source]

    if (schema !== undefined) {
      declarations.push({ index, name: fragment[VALIDATION_NAME], schema })
    }
  }

  return declarations
}
