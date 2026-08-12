import type {
  OutputOf,
  SchemaOf,
  ValidateSchemas,
  ValidationSource,
} from './schemas'
import type { IsUnion, KeysOfUnion, UnionToIntersection } from './utils'

/**
 * One composable unit of a declaration: a set of schemas, at most one per
 * source. A `defineValidation` call's schemas are one, and so is an inline
 * `{ body: x }` that was never a set.
 */
export type ValidationFragment = ValidateSchemas

/**
 * What `defineValidation` hands back: a readonly tuple holding **one**
 * fragment, spread into a declaration with `[...group]`.
 *
 * A tuple rather than the bare fragment, and that is the whole point: array
 * spread *appends*, so composing two sets that declare the same source keeps
 * both. Object-spreading two bare sets would produce a valid-looking flat
 * declaration with one source silently gone - the bug this shape exists to
 * make impossible.
 */
export type ValidationGroup<F extends ValidationFragment> = readonly [F]

/**
 * A collision the compiler refuses to resolve, carrying the sentence that says
 * what the author did. It is a normal type, so the declaration itself still
 * compiles; consuming the poisoned value is what fails, and the diagnostic
 * prints this message rather than "property does not exist on `never`".
 *
 * Deliberately **not** re-exported from the `/types` entry: a consumer meets it
 * in a diagnostic and fixes the declaration, never names it. Nothing they could
 * write with it is a thing worth writing.
 */
export interface CompositionError<Msg extends string> {
  __validationCompositionError: Msg
}

/**
 * Every schema declared for source `K` across a union of fragments - a union
 * itself when several fragments declare that source. Distributing over the
 * fragments is what makes this read the element union rather than any tuple
 * structure; `SchemaOf` is the same one rule the flat form reads a source with.
 */
type SchemaAt<Frag, K extends PropertyKey> = Frag extends unknown
  ? K extends keyof Frag
    ? SchemaOf<Frag[K]>
    : never
  : never

/** Those schemas' outputs - what the fragments contribute to that source. */
type OutputAt<Frag, K extends PropertyKey> = OutputOf<SchemaAt<Frag, K>>

/**
 * For each member of a union, the keys it shares with any *other* member. The
 * pairwise self-comparison is what makes overlapping contributions visible:
 * names and output keys arrive as two separate unions, whereas this question
 * lives inside one.
 *
 * One deliberate blind spot: members with identical types collapse into a
 * single union member before `Exclude` runs, so two fragments whose whole
 * outputs are identical are invisible here - and that is exactly the case
 * where the intersection does not lie (`A & A = A`). So the poison covers
 * every overlap the merged type would misreport, and only those.
 */
type OverlapKeys<U, All = U> = U extends unknown
  ? keyof U & KeysOfUnion<Exclude<All, U>>
  : never

/**
 * One source's delivered value: a lone contribution passes through untouched,
 * and several merge as their intersection - honest only when every one of them
 * is a plain object with keys none of the others also produce.
 *
 * Both failures are poisons rather than silent types, because both used to be
 * lies. Merging non-objects typed as `string & number` = `never`; overlapping
 * keys typed as an intersection the runtime never produces, since the runtime
 * hands back the last fragment's value for that key.
 */
type MergeOutputs<Outputs> =
  true extends IsUnion<Outputs>
    ? [Outputs] extends [Record<string, unknown>]
      ? [OverlapKeys<Outputs>] extends [never]
        ? UnionToIntersection<Outputs>
        : CompositionError<'two unnamed sets contribute the same output key to one source — name one of them'>
      : CompositionError<'colliding unnamed schemas for one source must all output plain objects'>
    : Outputs

/**
 * The handler's second parameter for a composed declaration: every source any
 * fragment declares, each carrying that source's merged output.
 *
 * Computed from the fragment array's **element union** (`F[number]`), never
 * from its tuple structure, so a group that lost its tuple type - composed
 * into a plain array, handed around as a value - keeps full inference.
 */
export type MergedContext<F extends readonly ValidationFragment[]> = {
  [K in KeysOfUnion<F[number]> & ValidationSource]: MergeOutputs<
    OutputAt<F[number], K>
  >
}

/**
 * What the phantom carries for a composed declaration: the union of the
 * schemas declared for each source, recording exactly which of them that
 * source must satisfy.
 *
 * A union, not an intersection, and the distinction is the reader's problem:
 * every fragment parses the whole raw source and all of them must pass, so the
 * input a client must send is the *intersection* of the members' inputs.
 * Collapsing that is the aggregator's arithmetic, not this phantom's.
 */
export type MergedSchemaMap<F extends readonly ValidationFragment[]> = {
  [K in KeysOfUnion<F[number]> & ValidationSource]: SchemaAt<F[number], K>
}
