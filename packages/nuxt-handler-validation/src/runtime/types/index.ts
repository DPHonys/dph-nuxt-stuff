import type { StandardSchemaV1 } from '@standard-schema/spec'

/** The four sources, in the settled fail-fast order. Every key is optional. */
export interface ValidationSchemas {
  routerParams?: SourceSchemas
  query?: SourceSchemas
  headers?: SourceSchemas
  body?: SourceSchemas
}

/** `'routerParams' | 'query' | 'headers' | 'body'`. */
export type ValidationSource = keyof ValidationSchemas

/**
 * What one source slot accepts: a schema, or a non-empty tuple of schemas that
 * each parse the same raw source and whose outputs merge. A tuple, not an
 * array, because a widened `StandardSchemaV1[]` cannot say how many schemas it
 * holds and the merged output could not be typed.
 */
export type SourceSchemas =
  | StandardSchemaV1
  | readonly [StandardSchemaV1, ...StandardSchemaV1[]]

/** A schema's output (`InferOutput`), so transforms land already applied. */
export type OutputOf<Schema> = Schema extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<Schema>
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
      : { [K in keyof T]: T[K] }

// Both sides distribute first, so `{ a } | { b }` against `{ c }` stays
// `{ a; c } | { b; c }` - the runtime hands back whichever branch matched.
type Merged<Head, Rest> = Head extends unknown
  ? Rest extends unknown
    ? Flattened<Head & Rest>
    : never
  : never

/**
 * A composed tuple's delivered value: element by element rather than through
 * `UnionToIntersection`, so a schema outputting a union of objects stays a
 * union through the merge.
 */
export type MergedOutput<T> = T extends readonly [
  infer Head extends StandardSchemaV1,
  ...infer Rest,
]
  ? Rest extends readonly [StandardSchemaV1, ...StandardSchemaV1[]]
    ? Merged<OutputOf<Head>, MergedOutput<Rest>>
    : OutputOf<Head>
  : never

/** One slot's delivered value: a lone schema's output, or the tuple's merge. */
export type SourceValue<T> = T extends readonly [
  StandardSchemaV1,
  ...StandardSchemaV1[],
]
  ? MergedOutput<T>
  : OutputOf<T>

/**
 * The handler's second parameter: exactly the sources the declaration
 * guarantees, each typed as its slot's delivered value. A key is guaranteed
 * only when its slot type cannot be `undefined`, so a declaration annotated
 * `const schemas: ValidationSchemas = { query }` guarantees nothing and
 * delivers no sources; use `satisfies ValidationSchemas` instead.
 */
export type ValidatedContext<S extends ValidationSchemas> = {
  [K in Extract<keyof S, ValidationSource> as undefined extends S[K]
    ? never
    : K]: SourceValue<S[K]>
}

/**
 * One projected issue - the whole of what a client is told about a rejected
 * value. Raw Standard Schema issues never reach it.
 */
export interface ValidationIssue {
  source: ValidationSource
  message: string
  path: Array<string | number>
}

/**
 * The h3 error's `data` payload on the wire, and what
 * `recognizeValidationError` hands a hook. A fetched failure sits at
 * `err.data.data.issues`.
 */
export interface ValidationErrorData {
  issues: ValidationIssue[]
}
