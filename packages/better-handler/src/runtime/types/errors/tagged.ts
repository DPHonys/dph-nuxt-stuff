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

// Whether `Output` is an `Error` instance rather than a record of fields
// that merely has a `name` and a `message`. TypeScript cannot see a
// prototype, so this reads the one trace inheritance leaves on a type:
// every member of `Error`'s interface, the optional ones included - `stack`,
// `cause`, and whatever a library merges into the global interface, as Effect
// merges its `~effect/...` markers. A class extending `Error` inherits all of
// them, method or none; a schema describing a plain record names its own
// keys and never states `Error`'s optional `stack` beside them.
type IsErrorInstance<Output> = Output extends Error
  ? keyof Error extends keyof Output
    ? true
    : false
  : false

// The keys a schema output has that the boundary never sends: `_tag`, which
// the declared tag replaces, and on an `Error` instance the members that are
// not its own enumerable data - `name`, `message`, `stack` and `cause`, own
// but not enumerable, and the markers spelled with a leading `~` that
// libraries keep on the prototype (Effect's type ids). A record of fields
// sends every key it has, a `name` and a `message` included.
type UnsentKey<Output> =
  | '_tag'
  | (IsErrorInstance<Output> extends true ? keyof Error | `~${string}` : never)

/**
 * The fields a thrown Known error goes out with, as its schema's output
 * describes them: the boundary sends a thrown value's own enumerable keys
 * beside `_tag`, so this is the output's keys without its methods, which live
 * on a class's prototype or are left out as JSON leaves a function out, and
 * without the members an `Error` instance holds but does not enumerate.
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
