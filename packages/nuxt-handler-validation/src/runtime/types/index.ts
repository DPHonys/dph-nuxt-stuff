/**
 * The `@dphonys/nuxt-handler-validation/types` entry - type-only, safe to
 * import from app code. Everything here is public and nameable; what is not
 * declared here is internal (see `./internal`).
 */
import type { StandardSchemaV1 } from '@standard-schema/spec'

/**
 * The four sources, in the settled fail-fast order
 * (routerParams -> query -> headers -> body). Names follow h3's vocabulary;
 * three of them match h3 v2's `validate: { body, headers, query }` keys, and
 * validated route params stay this package's own differentiator.
 *
 * Every key is optional and all four are mixable in one declaration.
 */
export interface ValidationSchemas {
  routerParams?: SourceSchemas
  query?: SourceSchemas
  headers?: SourceSchemas
  body?: SourceSchemas
}

/**
 * `'routerParams' | 'query' | 'headers' | 'body'` - derived rather than
 * spelled again, so the source list has exactly one definition.
 */
export type ValidationSource = keyof ValidationSchemas

/**
 * What one source slot accepts: a schema, or a non-empty tuple of schemas.
 *
 * The tuple **is** the whole composition model. Each element parses the same
 * raw source, in order; the delivered value is the merge of their outputs.
 * There is no definer, no group, no set name: the unit of reuse is the schema
 * value itself, which already travels as a plain export and has no source keys
 * to misspell.
 *
 * A non-empty *tuple*, not an array: a widened `StandardSchemaV1[]` cannot say
 * how many schemas it holds, so the merged output could not be typed. The
 * constraint rejects it, which keeps `validated` honest.
 */
export type SourceSchemas =
  | StandardSchemaV1
  | readonly [StandardSchemaV1, ...StandardSchemaV1[]]

/**
 * A schema's *output* (`InferOutput`), so coercions and transforms land in the
 * handler already applied. Distributive, so a union of schemas yields the
 * union of their outputs.
 */
export type OutputOf<Schema> = Schema extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<Schema>
  : never

/**
 * A composed tuple's delivered value: the intersection of its elements'
 * outputs, built element by element.
 *
 * Element by element rather than `UnionToIntersection` of the flattened
 * outputs, and the difference is honesty: one schema outputting a union of
 * objects must stay a union inside the intersection - the runtime hands back
 * whichever branch matched, never the branches' merge.
 */
export type MergedOutput<T> = T extends readonly [
  infer Head extends StandardSchemaV1,
  ...infer Rest,
]
  ? Rest extends readonly [StandardSchemaV1, ...StandardSchemaV1[]]
    ? OutputOf<Head> & MergedOutput<Rest>
    : OutputOf<Head>
  : never

/**
 * One source slot's delivered value: a lone schema's output passes through
 * untouched - a primitive included - and a tuple delivers the merge.
 */
export type SourceValue<T> = T extends readonly [
  StandardSchemaV1,
  ...StandardSchemaV1[],
]
  ? MergedOutput<T>
  : OutputOf<T>

/**
 * The handler's second parameter: exactly the sources the declaration
 * **guarantees**, each typed as its slot's delivered value.
 *
 * Mapping over `keyof S` - the inferred literal type, not the constraint - is
 * what makes undeclared sources vanish instead of arriving as `unknown` or as
 * optional keys; reading one is a compile error naming the missing key.
 *
 * A key is guaranteed only when its slot type **cannot be `undefined`**, and
 * that clause is what keeps the promise honest for a declaration written
 * against the public type. `keyof S` is only the four literal keys while `S` is
 * inferred; a declaration annotated `const schemas: ValidationSchemas = { query }`
 * hands `S` the whole interface, whose four optional keys would otherwise all
 * arrive - `unknown` at compile time and `undefined` at request time, because
 * the plan skips the slots the object does not hold. Such a declaration
 * guarantees no source at all, so it delivers none: every read is a compile
 * error naming the key, which is the same error a genuinely undeclared source
 * gets. Annotate with `satisfies ValidationSchemas` (or leave the literal
 * inline) to keep the sources readable.
 */
export type ValidatedContext<S extends ValidationSchemas> = {
  [K in Extract<keyof S, ValidationSource> as undefined extends S[K]
    ? never
    : K]: SourceValue<S[K]>
}

/**
 * One projected issue - the whole of what a client is told about a rejected
 * value. Raw Standard Schema issues never reach it; `path` is normalized to
 * strings and numbers. Carried over from v1 unchanged.
 */
export interface ValidationIssue {
  source: ValidationSource
  message: string
  path: Array<string | number>
}

/**
 * One shape read on both sides: the h3 error's `data` payload on the wire,
 * and what `recognizeValidationError` hands an observability hook. Carried
 * over from v1 unchanged - a fetched failure still sits at
 * `err.data.data.issues`.
 */
export interface ValidationErrorData {
  issues: ValidationIssue[]
}
