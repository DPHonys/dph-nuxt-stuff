import type { IsAny } from '../utils'
import type { EntryOutput } from './declaration'

/**
 * A Tagged error: the value a Known error carries as its `data`, its `_tag`
 * beside the fields its declaration describes. On the server it is read by
 * its tag, as `recognizeKnownError` hands it back; the fields of a route's
 * own variants are typed from that route's declaration.
 */
export interface TaggedError {
  readonly _tag: string
}

// Whether any key of `Output` holds a function. A record of fields never
// does; a class instance does, through its methods.
type HasMethod<Output> = true extends {
  [Key in keyof Output]-?: Output[Key] extends (...args: never[]) => void
    ? true
    : false
}[keyof Output]
  ? true
  : false

// The keys a schema output has that the boundary never sends: `_tag`, which
// the declared tag replaces, and on a class instance - an `Error` carrying
// methods, such as an Effect error class's - the keys that are not its own
// enumerable data: `Error`'s `name`, `message`, `stack` and `cause`, and the
// markers spelled with a leading `~` that libraries keep on the prototype
// (Effect's `~effect/...` type ids). An object literal that merely has a
// `name` and a `message` carries no method, so its fields stay fields.
type UnsentKey<Output> =
  | '_tag'
  | (Output extends Error
      ? HasMethod<Output> extends true
        ? keyof Error | `~${string}`
        : never
      : never)

/**
 * The fields a thrown Known error goes out with, as its schema's output
 * describes them: the output's keys beside `_tag`, without its methods, which
 * live on a class's prototype or are left out as JSON leaves a function out.
 * Distributes over a union output, so each member keeps its own keys.
 */
export type SentFields<Output> = Output extends unknown
  ? {
      [Key in keyof Output as Key extends UnsentKey<Output>
        ? never
        : Output[Key] extends (...args: never[]) => void
          ? never
          : Key]: Output[Key]
    }
  : never

// One declared variant, before it crosses the wire. An output nothing can be
// said about - an untyped schema's `any` or `unknown` - contributes its tag
// alone, rather than collapsing the route's whole union into `any`.
type VariantOf<Tag extends string, Entry> = [EntryOutput<Entry>] extends [never]
  ? { _tag: Tag }
  : IsAny<EntryOutput<Entry>> extends true
    ? { _tag: Tag }
    : unknown extends EntryOutput<Entry>
      ? { _tag: Tag }
      : { _tag: Tag } & SentFields<EntryOutput<Entry>>

/**
 * The Known errors a route's `errors` declares, one variant per tag: the tag
 * as `_tag` beside the fields the boundary sends. What a branded Handler
 * carries for the generated map, which applies `Wire` to it.
 */
export type KnownErrorsOf<Errors> = {
  [Tag in keyof Errors & string]: VariantOf<Tag, Errors[Tag]>
}[keyof Errors & string]
