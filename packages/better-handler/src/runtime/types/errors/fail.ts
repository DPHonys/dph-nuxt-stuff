import type { ArgsFor, IsAny } from '../utils'
import type { EntryOutput, ErrorDeclarations } from './declaration'

// Distributes over a union output, so each member keeps its own keys, and
// remaps rather than `Omit`s, so a hover shows the fields themselves.
type WithoutTag<Output> = Output extends unknown
  ? { [Key in keyof Output as Key extends '_tag' ? never : Key]: Output[Key] }
  : never

/**
 * The fields a Known error carries beside `_tag`: its schema's output without
 * `_tag`, or `null` for an entry without a schema, which carries none.
 */
export type FieldsOf<Entry> = [EntryOutput<Entry>] extends [never]
  ? null
  : IsAny<EntryOutput<Entry>> extends true
    ? // `any` is the answer an untyped schema gives, and stays one.
      any
    : WithoutTag<EntryOutput<Entry>>

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
