import type { ArgsFor, IsAny } from '../utils'
import type { EntryInput, ErrorDeclarations } from './declaration'

// A member left with no key beside `_tag` names no field: an `object` input,
// or one carrying only `_tag`. The runtime still takes only a record of them,
// empty or not, and an index signature refuses a primitive, an array and a
// function, as it does. Spelled out rather than aliased, so a diagnostic
// prints the type itself; its values are `unknown` because the schema says no
// more than that.
type NamedOrOpen<Fields> = [keyof Fields] extends [never]
  ? // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type
    Record<string, unknown>
  : Fields

// Distributes over a union input, so each member keeps its own keys, and
// remaps rather than `Omit`s, so a hover shows the fields themselves.
type WithoutTag<Input> = Input extends unknown
  ? NamedOrOpen<{
      [Key in keyof Input as Key extends '_tag' ? never : Key]: Input[Key]
    }>
  : never

/**
 * The fields a Known error carries beside `_tag`: its schema's input without
 * `_tag` - what the handler throws and the wire carries, which a transforming
 * schema's output is not - or `null` for an entry without a schema, which
 * carries none.
 */
export type FieldsOf<Entry> = [EntryInput<Entry>] extends [never]
  ? null
  : IsAny<EntryInput<Entry>> extends true
    ? // `any` is the answer an untyped schema gives, and stays one.
      any
    : unknown extends EntryInput<Entry>
      ? // An `unknown` input says nothing of the fields either, and takes
        // any record of them, as an input naming none does.
        // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type
        Record<string, unknown>
      : WithoutTag<EntryInput<Entry>>

/**
 * What the Fail helper returns for the handler to throw: an `Error` carrying
 * `_tag` and the fields as its own properties. A field named like one of
 * `Error`'s own, such as `message`, is the field.
 */
export type FailedError<Tag extends string, Fields> = {
  readonly _tag: Tag
} & ([Fields] extends [null]
  ? Error
  : Fields extends unknown
    ? Omit<Error, keyof Fields> & Fields
    : never)

/**
 * The Fail helper on the Handler context of a route declaring `errors`. It
 * pairs a declared tag with that tag's fields, as the Respond helper pairs a
 * status with its value: a tag declared without a schema takes no fields, and
 * refuses any.
 *
 * ```ts
 * throw fail('order-not-found', { id: route.id })
 * throw fail('order-locked')
 * ```
 */
export interface Fail<Errors extends ErrorDeclarations> {
  <Tag extends string>(
    tag: Tag extends keyof Errors ? Tag : keyof Errors & string,
    ...fields: FailArgs<Errors, Tag>
  ): FailedError<Tag, FieldsFor<Errors, Tag>>
}

// `Tag` is inferred from any string, not only a declared one, so a tag the
// route never declared is refused at the tag - against the declared ones -
// rather than on an argument count the fallback to the constraint would
// pick. A union of declared tags distributes, and admits each tag's arity.
type FailArgs<Errors, Tag extends string> = Tag extends keyof Errors
  ? ArgsFor<FieldsOf<Errors[Tag]>>
  : unknown[]

type FieldsFor<Errors, Tag extends string> = Tag extends keyof Errors
  ? FieldsOf<Errors[Tag]>
  : never
