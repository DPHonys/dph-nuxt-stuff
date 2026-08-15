import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { VALIDATION_NAME } from '../shared/name'
import type {
  OutputOf,
  SchemaOf,
  ValidateSchemas,
  ValidationSource,
} from './schemas'
import type { IsUnion, KeysOfUnion, UnionToIntersection } from './utils'

/**
 * A set's name, riding on the fragment itself under the `unique symbol` key.
 *
 * Internal: a consumer never writes this. `defineValidation`'s named form is
 * the only thing that produces it, which is exactly the point of the symbol.
 */
export interface NameMarker<Name extends string> {
  [VALIDATION_NAME]: Name
}

/**
 * One composable unit of a declaration: a set of schemas, at most one per
 * source, optionally carrying the name its outputs nest under. A
 * `defineValidation` call's schemas are one, and so is an inline `{ body: x }`
 * that was never a set.
 */
export type ValidationFragment = ValidateSchemas & Partial<NameMarker<string>>

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

/** The named fragments of a declaration, and the unnamed ones. */
type NamedOf<F extends readonly ValidationFragment[]> = Extract<
  F[number],
  NameMarker<string>
>
type UnnamedOf<F extends readonly ValidationFragment[]> = Exclude<
  F[number],
  NameMarker<string>
>

/**
 * Which fragments of a union actually declare source `K` - the merge's
 * **arity**, and it has to be read here rather than off the outputs.
 *
 * Counting output members instead cannot tell "two fragments contributed" from
 * "one fragment's schema outputs a union": a lone `z.union([z.string(),
 * z.number()])` would poison as a collision that never happens, and a lone
 * `z.union([z.object(a), z.object(b)])` would type as `a & b`, which the
 * runtime never produces - it hands back whichever branch matched.
 */
type DeclaringAt<Frag, K extends ValidationSource> = Extract<
  Frag,
  Record<K, StandardSchemaV1>
>

/** What the unnamed fragments contribute to source `K`. */
type UnnamedOutAt<
  F extends readonly ValidationFragment[],
  K extends ValidationSource,
> = OutputAt<UnnamedOf<F>, K>

/**
 * The unnamed contributions to one source, merged: a lone contribution passes
 * through untouched - a primitive included, since there is nothing to merge it
 * into - and several merge as their intersection, honest only when every one of
 * them is a plain object with keys none of the others also produce.
 *
 * Both failures are poisons rather than silent types, because both used to be
 * lies. Merging non-objects typed as `string & number` = `never`; overlapping
 * keys typed as an intersection the runtime never produces, since the runtime
 * hands back the last fragment's value for that key.
 *
 * The non-object test runs **first**, and inseparably: on a non-object output
 * `OverlapKeys` compares `String.prototype`'s keys and reports an overlap that
 * is not the author's mistake, printing the wrong sentence.
 */
type MergeUnnamedAt<
  F extends readonly ValidationFragment[],
  K extends ValidationSource,
> =
  true extends IsUnion<DeclaringAt<UnnamedOf<F>, K>>
    ? [UnnamedOutAt<F, K>] extends [Record<string, unknown>]
      ? [OverlapKeys<UnnamedOutAt<F, K>>] extends [never]
        ? UnionToIntersection<UnnamedOutAt<F, K>>
        : CompositionError<'two unnamed sets contribute the same output key to one source — name one of them'>
      : CompositionError<'colliding unnamed schemas for one source must all output plain objects'>
    : UnnamedOutAt<F, K>

/** The set names contributing to source `K` - a union of literal strings. */
type NamesAt<
  F extends readonly ValidationFragment[],
  K extends ValidationSource,
> =
  NamedOf<F> extends infer Frag
    ? Frag extends NameMarker<infer Name>
      ? K extends keyof Frag
        ? Name
        : never
      : never
    : never

/** What the sets called `Name` contribute to source `K`. */
type NamedOutAt<
  F extends readonly ValidationFragment[],
  K extends ValidationSource,
  Name extends string,
> = OutputAt<Extract<NamedOf<F>, NameMarker<Name>>, K>

/**
 * The named layer of one source: `{ [name]: that set's exact output }` per
 * name, intersected - which is what lets `query.pagination` be passed whole to
 * a helper typed off the pagination schema, with no other set's keys on it.
 *
 * Two *different* sets sharing one name on one source is a poison, and it
 * poisons **that name's value alone**: the source's other names and its unnamed
 * keys stay usable, because only that one slot is ambiguous. Read from the
 * fragments declaring the name, not from their outputs, for the same reason
 * `MergeUnnamedAt` does.
 */
type NamedPartAt<
  F extends readonly ValidationFragment[],
  K extends ValidationSource,
> = UnionToIntersection<
  NamesAt<F, K> extends infer Name
    ? Name extends string
      ? {
          [P in Name]: true extends IsUnion<
            DeclaringAt<Extract<NamedOf<F>, NameMarker<Name>>, K>
          >
            ? CompositionError<'two different sets share one name on this source'>
            : NamedOutAt<F, K, Name>
        }
      : never
    : never
>

/**
 * One source's delivered value, in the four shapes a declaration can produce.
 *
 * Unnamed only, and named only, are each their own layer. Mixed is the flat
 * merge intersected with the nested one, under two further poisons: an unnamed
 * output that is not a plain object has nothing for the named layer to sit
 * beside, and a set name landing on an unnamed output key means two sets are
 * claiming one slot. That second one poisons the **whole source** rather than
 * the one key, because the collision is between the two layers and neither is
 * the obvious loser.
 *
 * The overlap poison is returned **bare** from the mixed branch - never
 * intersected with the named part - so the diagnostic prints that sentence
 * alone rather than as one half of an intersection.
 */
type SourceValueAt<
  F extends readonly ValidationFragment[],
  K extends ValidationSource,
> = [NamesAt<F, K>] extends [never]
  ? MergeUnnamedAt<F, K>
  : [UnnamedOutAt<F, K>] extends [never]
    ? NamedPartAt<F, K>
    : [UnnamedOutAt<F, K>] extends [Record<string, unknown>]
      ? [KeysOfUnion<UnnamedOutAt<F, K>> & NamesAt<F, K>] extends [never]
        ? MergeUnnamedAt<F, K> extends infer Unnamed
          ? [Unnamed] extends [CompositionError<string>]
            ? Unnamed
            : Unnamed & NamedPartAt<F, K>
          : never
        : CompositionError<'a set name collides with an unnamed schema output key on this source'>
      : CompositionError<'unnamed schemas composed beside named sets must output plain objects'>

/**
 * The handler's second parameter for a composed declaration: every source any
 * fragment declares, each carrying that source's merged output.
 *
 * Computed from the fragment array's **element union** (`F[number]`), never
 * from its tuple structure, so a group that lost its tuple type - composed
 * into a plain array, handed around as a value - keeps full inference. Masking
 * the keys to `ValidationSource` is also what keeps the name symbol out of the
 * delivered context.
 */
export type MergedContext<F extends readonly ValidationFragment[]> = {
  [K in KeysOfUnion<F[number]> & ValidationSource]: SourceValueAt<F, K>
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
 *
 * **Names are stripped.** Namespacing is output-only - every schema still
 * parses the whole raw source - so a named set's schema appears here exactly as
 * an unnamed one's does, and the raw input a client sends is flat however the
 * delivered values nest.
 */
export type MergedSchemaMap<F extends readonly ValidationFragment[]> = {
  [K in KeysOfUnion<F[number]> & ValidationSource]: SchemaAt<F[number], K>
}
