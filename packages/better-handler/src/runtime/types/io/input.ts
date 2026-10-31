import type { StandardSchemaV1 } from '@standard-schema/spec'

/**
 * A route's `input`: one slot per Validation source, each optional. The
 * sources validate in the order `route -> query -> headers -> body`, whatever
 * order the declaration writes them in.
 */
export interface InputDeclaration {
  readonly route?: SourceSchemas
  readonly query?: SourceSchemas
  readonly headers?: SourceSchemas
  readonly body?: SourceSchemas
}

/** `'route' | 'query' | 'headers' | 'body'`. */
export type ValidationSource = keyof InputDeclaration

/**
 * What one source slot holds: a Standard Schema, or a non-empty tuple of them
 * that each parse the same raw source and whose outputs merge. A tuple, not
 * an array, because a widened `StandardSchemaV1[]` cannot say how many
 * schemas it holds and the merged output could not be typed.
 */
export type SourceSchemas =
  | StandardSchemaV1
  | readonly [StandardSchemaV1, ...StandardSchemaV1[]]

/** A schema's output, so a transform or coercion lands already applied. */
export type OutputOf<Schema> = Schema extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<Schema>
  : never

/** A schema's input: what a client sends, before any transform. */
export type InputOf<Schema> = Schema extends StandardSchemaV1
  ? StandardSchemaV1.InferInput<Schema>
  : never

// One object type restated as its own keys, so a merge reads back on hover as
// the flat record the runtime hands over. An index-signature output widens
// `keyof`, and restating from that would drop every named key beside it.
type Flattened<T> = string extends keyof T
  ? T
  : number extends keyof T
    ? T
    : symbol extends keyof T
      ? T
      : { [Key in keyof T]: T[Key] }

// Both sides distribute first, so `{ a } | { b }` against `{ c }` stays
// `{ a; c } | { b; c }`: the runtime hands back whichever branch matched.
type Merged<Head, Rest> = Head extends unknown
  ? Rest extends unknown
    ? Flattened<Head & Rest>
    : never
  : never

/**
 * A composed tuple's validated value: its elements' outputs merged in tuple
 * order, element by element rather than through a union-to-intersection, so
 * a schema whose output is a union of objects stays a union through the
 * merge.
 */
export type MergedOutput<T> = T extends readonly [
  infer Head extends StandardSchemaV1,
  ...infer Rest,
]
  ? Rest extends readonly [StandardSchemaV1, ...StandardSchemaV1[]]
    ? Merged<OutputOf<Head>, MergedOutput<Rest>>
    : OutputOf<Head>
  : never

/** One slot's validated value: a lone schema's output, or the tuple's merge. */
export type SourceValue<T> = T extends readonly [
  StandardSchemaV1,
  ...StandardSchemaV1[],
]
  ? MergedOutput<T>
  : OutputOf<T>

/**
 * A composed tuple's input: the intersection of its elements' inputs,
 * flattened to one record. Every element parses the whole raw source, so what
 * a client sends must satisfy all of them: outputs merge, inputs intersect.
 */
// Not distributed the way `Merged` is: a union input means "send either", and
// intersecting the union whole keeps that, where distributing would split it.
export type MergedInput<T> = T extends readonly [
  infer Head extends StandardSchemaV1,
  ...infer Rest,
]
  ? Rest extends readonly [StandardSchemaV1, ...StandardSchemaV1[]]
    ? Flattened<InputOf<Head> & MergedInput<Rest>>
    : InputOf<Head>
  : never

/** One slot's input: a lone schema's input, or the tuple's intersection. */
export type SourceInput<T> = T extends readonly [
  StandardSchemaV1,
  ...StandardSchemaV1[],
]
  ? MergedInput<T>
  : InputOf<T>

/**
 * The sources a declaration guarantees. A slot is guaranteed only when its
 * type cannot be `undefined`, so a declaration annotated
 * `const input: InputDeclaration = { query }` guarantees nothing; write
 * `satisfies InputDeclaration` instead.
 */
export type DeclaredSource<Input> = keyof {
  [Key in Extract<keyof Input, ValidationSource> as undefined extends Input[Key]
    ? never
    : Key]: 0
}

/** Whether a declaration guarantees at least one Validation source. */
export type HasInput<Input> = [DeclaredSource<Input>] extends [never]
  ? false
  : true

// The sources a declaration may hold: every slot whose type admits a schema,
// guaranteed or not.
type PossibleSource<Input> = keyof {
  [Key in Extract<keyof Input, ValidationSource> as [
    Exclude<Input[Key], undefined>,
  ] extends [never]
    ? never
    : Key]: 0
}

/**
 * Whether a declaration may hold a Validation source, which is when the
 * runtime may raise the Built-in validation-failed variant: it validates
 * whatever the value holds, so a declaration annotated
 * `const input: InputDeclaration = { query }`, which guarantees no source,
 * still may. `false` only when the sources are proven empty.
 */
export type MayHaveInput<Input> = [PossibleSource<Input>] extends [never]
  ? false
  : true

/**
 * The Validated context: one key per declared source, holding that slot's
 * validated value. Undeclared sources are absent rather than `unknown`.
 */
export type ValidatedContext<Input> = {
  [Key in DeclaredSource<Input>]: SourceValue<Input[Key]>
}

/**
 * The Request input: what a client must send for a route, one key per
 * declared source, each the declared schemas' input type, a composed tuple's
 * intersected. The client-side twin of the Validated context, which holds
 * outputs.
 */
export type RequestInput<Input> = {
  [Key in DeclaredSource<Input>]: SourceInput<Input[Key]>
}

/**
 * One projected issue: the whole of what a client is told about a rejected
 * value - the source it came from, the schema's message, and the path as
 * plain keys. Nothing else a schema library hangs off an issue crosses.
 */
export interface ValidationIssue {
  source: ValidationSource
  message: string
  path: Array<string | number>
}

/**
 * The Built-in validation-failed variant: the Tagged error every route that
 * declares `input` can fail with, sent with status `400`. Its issues all name
 * the one source that failed, as validation stops at the first.
 */
export interface ValidationFailed {
  _tag: 'validation-failed'
  issues: ValidationIssue[]
}
