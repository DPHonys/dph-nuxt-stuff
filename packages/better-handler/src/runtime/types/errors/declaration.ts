import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { IsAny, IsUnion } from '../utils'

/** The common 4xx and 5xx statuses, as completions; any other number fits. */
export type ErrorStatus =
  | 400
  | 401
  | 402
  | 403
  | 404
  | 405
  | 409
  | 410
  | 422
  | 429
  | 500
  | 501
  | 502
  | 503
  | 504
  // `number & {}` keeps the literals above as completions instead of letting
  // `number` absorb them.
  | (number & {})

/**
 * One Error declaration: the HTTP status the failure goes out with, an
 * integer from 400 to 599, and optionally a Standard Schema describing the
 * fields beside `_tag`.
 */
export interface ErrorEntry {
  readonly status: ErrorStatus
  readonly schema?: StandardSchemaV1
}

/**
 * A route's `errors`: Error declarations keyed by tag. Reuse is object
 * spread, narrowing is `Pick`.
 */
export interface ErrorDeclarations {
  readonly [tag: string]: ErrorEntry
}

/** The tags the package keeps for its own variants. */
export type ReservedTag = 'validation-failed' | 'request-failed'

/**
 * A rule a declaration broke. Nothing the author writes can satisfy it, so
 * the diagnostic prints at the offending key with this sentence inside it.
 */
export interface ErrorDeclarationError<Msg extends string> {
  'error-declaration-error': Msg
}

/** What an entry's schema produces, or `never` for an entry without one. */
export type EntryOutput<Entry> = Entry extends {
  readonly schema: infer Schema extends StandardSchemaV1
}
  ? StandardSchemaV1.InferOutput<Schema>
  : never

// The `_tag` literals a schema's output carries, over every member of a union
// output; `never` when no member has the key.
type TagLiteralsOf<Output> = Output extends unknown
  ? '_tag' extends keyof Output
    ? Exclude<Output['_tag'], undefined>
    : never
  : never

/** The sentence a tag itself breaks, or `never` when it is a tag. */
type TagRule<Tag extends string> = string extends Tag
  ? 'an error tag must be one string literal'
  : IsUnion<Tag> extends true
    ? 'an error tag must be one string literal'
    : Tag extends ''
      ? 'an error tag must be a non-empty string'
      : Tag extends ReservedTag
        ? `${Tag} is reserved for the built-in variant - rename the declared error`
        : never

/**
 * The sentence an entry's schema breaks against its tag, or `never`. The
 * schema describes the fields beside `_tag`, so its output is an object; when
 * that output carries a `_tag` literal too, it is the tag itself.
 */
// `any` and `unknown` are what an untyped schema answers; nothing can be
// said about its fields, so nothing is refused.
type SchemaRule<Tag extends string, Output> =
  IsAny<Output> extends true
    ? never
    : unknown extends Output
      ? never
      : [Output] extends [never]
        ? never
        : [Output] extends [object]
          ? [Output] extends [readonly unknown[] | ((...args: never[]) => void)]
            ? 'the schema must describe an object of fields beside _tag'
            : TagLiteralsOf<Output> extends infer Literal
              ? [Literal] extends [never]
                ? never
                : string extends Literal
                  ? never
                  : [Literal] extends [Tag]
                    ? never
                    : `the schema's output has _tag ${Literal & string}, which must equal the tag ${Tag}`
              : never
          : 'the schema must describe an object of fields beside _tag'

// What JSON has no form for. Functions are not here: JSON leaves a
// function-valued field out, the boundary never collects one, and a class
// instance's methods - an Effect error's `toJSON` and `pipe` among them - are
// not fields at all, so refusing them would refuse every Effect error class.
type NoJsonForm = bigint | symbol

// Whether a value inside `data` holds anything JSON has no form for, followed
// into objects, arrays and a nested value's own `toJSON`, which JSON calls.
// Bounded, and `true` only for a member it can name: an `unknown` or `any`
// field says nothing, so it is never refused.
type HoldsNoJsonForm<Value, Depth extends unknown[] = []> =
  IsAny<Value> extends true
    ? false
    : unknown extends Value
      ? false
      : Depth['length'] extends 8
        ? false
        : Value extends NoJsonForm
          ? true
          : Value extends (...args: never[]) => void
            ? false
            : Value extends { toJSON: (...args: never[]) => infer Json }
              ? HoldsNoJsonForm<Json, [...Depth, unknown]>
              : Value extends readonly (infer Item)[]
                ? HoldsNoJsonForm<Item, [...Depth, unknown]>
                : Value extends object
                  ? true extends {
                      [Key in keyof Value & string]-?: HoldsNoJsonForm<
                        Value[Key],
                        [...Depth, unknown]
                      >
                    }[keyof Value & string]
                    ? true
                    : false
                  : false

// The fields of a schema's output that cannot go out as JSON, over every
// member of a union output. The output itself is never serialised whole -
// the boundary copies its own fields - so its own `toJSON` is not followed.
type UnsendableFields<Output> = Output extends unknown
  ? {
      [Key in keyof Output & string]-?: Key extends '_tag'
        ? never
        : true extends HoldsNoJsonForm<Output[Key]>
          ? Key
          : never
    }[keyof Output & string]
  : never

/**
 * The sentence an entry's fields break, or `never`: each goes out inside
 * `data` through JSON, so a field JSON cannot carry is refused.
 */
type FieldsRule<Output> =
  IsAny<Output> extends true
    ? never
    : unknown extends Output
      ? never
      : UnsendableFields<Output> extends infer Field extends string
        ? [Field] extends [never]
          ? never
          : `the field ${Field} cannot go out as JSON - it holds a bigint or a symbol`
        : never

/**
 * Every sentence a tag and its entry break, checked at the tag: the tag
 * rules first, then the schema's against it, then its fields'. `unknown`,
 * the identity of `&`, when the declaration holds.
 */
export type TagGuard<Tag extends string, Entry> = [TagRule<Tag>] extends [never]
  ? [SchemaRule<Tag, EntryOutput<Entry>>] extends [never]
    ? [FieldsRule<EntryOutput<Entry>>] extends [never]
      ? unknown
      : ErrorDeclarationError<FieldsRule<EntryOutput<Entry>>>
    : ErrorDeclarationError<SchemaRule<Tag, EntryOutput<Entry>>>
  : ErrorDeclarationError<TagRule<Tag>>

/**
 * An entry's own keys, checked one by one: anything beside `status` and
 * `schema` is refused at that key, so a stray `payload:` is never a silent
 * "no schema".
 */
export type EntryKeysGuard<Entry> = {
  readonly [Key in keyof Entry]: Key extends 'status' | 'schema'
    ? unknown
    : ErrorDeclarationError<`${Key & string} is not an error entry key - an entry takes status and schema`>
}

/**
 * The guard a route's `errors` intersects with: each key's tag and schema
 * checked at the key, and each entry's own keys inside it.
 */
export type ErrorDeclarationsGuard<Errors> = {
  readonly [Tag in keyof Errors]: Tag extends string
    ? [TagGuard<Tag, Errors[Tag]>] extends [ErrorDeclarationError<string>]
      ? TagGuard<Tag, Errors[Tag]>
      : EntryKeysGuard<Errors[Tag]>
    : ErrorDeclarationError<'an error tag must be a string key - quote a numeric one'>
}
