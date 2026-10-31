import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { IsAny } from '../utils'
import type { InputOf, OutputOf, ValidationSource } from './input'

/**
 * A rule an `input` declaration broke. Nothing the author writes can satisfy
 * it, so the diagnostic prints at the offending source key with this sentence
 * inside it.
 */
export interface InputDeclarationError<Msg extends string> {
  'input-declaration-error': Msg
}

// One key, unless it is the whole key space an index signature contributes.
type NamedKey<Key> = string extends Key
  ? never
  : number extends Key
    ? never
    : symbol extends Key
      ? never
      : Key

// Member by member and key by key, before anything is unioned: an index
// signature contributes nothing, and cannot take a named key down with it -
// neither one standing beside it in the same output nor a sibling's, which a
// union of whole key spaces would absorb into `string`.
type NamedKeys<T> = T extends unknown
  ? keyof { [Key in keyof T as NamedKey<Key>]: 0 }
  : never

// Whether any member of an output has an index signature: a passthrough,
// loose or record output, which hands back keys it does not name. `any` and
// `unknown` say nothing either way, and pass.
type HasIndexSignature<Output> =
  IsAny<Output> extends true
    ? false
    : Output extends unknown
      ? string extends keyof Output
        ? true
        : number extends keyof Output
          ? true
          : symbol extends keyof Output
            ? true
            : false
      : never

type ElementOutputs<T extends readonly StandardSchemaV1[]> = {
  [Index in keyof T]: OutputOf<T[Index]>
}

// Each element's named keys, unioned only once they are named keys: an `any`
// or `unknown` output would absorb its siblings' outputs into itself in a
// union of the outputs.
type NamedKeysOfEach<Outputs extends readonly unknown[]> = {
  [Index in keyof Outputs]: NamedKeys<Outputs[Index]>
}[number]

/** Whether any two of a tuple's outputs share a named key. */
// Head against the rest: pairwise without the quadratic spelling.
export type HasKeyOverlap<Outputs extends readonly unknown[]> =
  Outputs extends readonly [
    infer Head,
    ...infer Rest extends readonly unknown[],
  ]
    ? [NamedKeys<Head> & NamedKeysOfEach<Rest>] extends [never]
      ? HasKeyOverlap<Rest>
      : true
    : false

/**
 * Whether an output can be merged with its siblings': an object that is not
 * an array or a function. Structural, so a `Date` or `Map` output passes here
 * and is the runtime merge's to refuse. `any` and `unknown` say nothing about
 * the output, so they pass and the runtime merge refuses what is no plain
 * object; `any` is answered before the distribution, which would otherwise
 * send it down both branches.
 */
export type IsMergeableOutput<Output> =
  IsAny<Output> extends true
    ? true
    : unknown extends Output
      ? true
      : Output extends object
        ? Output extends readonly unknown[] | ((...args: never[]) => void)
          ? false
          : true
        : false

// Element by element, for the reason `NamedKeysOfEach` gives.
type EveryMergeable<Outputs extends readonly unknown[]> = [
  { [Index in keyof Outputs]: IsMergeableOutput<Outputs[Index]> }[number],
] extends [true]
  ? true
  : false

/**
 * Whether an element after the first has an index signature. The merge is
 * later-wins, so a later passthrough would hand back the raw source's value
 * over every named output before it - a coerced `page` back to its string.
 * First, its named outputs are overwritten by the converted ones after it.
 */
type HasLaterIndexSignature<Outputs extends readonly unknown[]> =
  Outputs extends readonly [unknown, ...infer Rest extends readonly unknown[]]
    ? true extends {
        [Index in keyof Rest]: HasIndexSignature<Rest[Index]>
      }[number]
      ? true
      : false
    : false

/**
 * The rule a composed slot must keep, or `unknown` when it keeps it: every
 * element produces an object, only the first may have an index signature,
 * and no two share a named output key. The object rule runs first: on a
 * primitive output the overlap check would compare `String.prototype`'s keys
 * and print the wrong sentence.
 */
export type ComposableSlot<T> = T extends readonly [StandardSchemaV1]
  ? unknown
  : T extends readonly [StandardSchemaV1, ...StandardSchemaV1[]]
    ? EveryMergeable<ElementOutputs<T>> extends true
      ? HasLaterIndexSignature<ElementOutputs<T>> extends true
        ? InputDeclarationError<'only the first schema composed on one source may produce an index signature - put the passthrough, loose or record schema first, so the named outputs after it win the merge'>
        : HasKeyOverlap<ElementOutputs<T>> extends true
          ? InputDeclarationError<'schemas composed on one source must produce disjoint output keys - merge them in your schema library instead'>
          : unknown
      : InputDeclarationError<'every schema composed on one source must produce an object output - not a primitive, an array or a function'>
    : unknown

// One value as the schema takes it: a string, or an array of them, is what a
// URL or a header hands over. `unknown` and `any` take anything, a coerce
// schema's input among them.
type TakesString<Value> = unknown extends Value
  ? true
  : true extends (
        Value extends readonly (infer Element)[]
          ? unknown extends Element
            ? true
            : Element extends string
              ? true
              : false
          : Value extends string
            ? true
            : false
      )
    ? true
    : false

// The keys of one schema's input that take no string. A record only: a
// non-record input is no set of keys a URL names. Distributed, so each
// member of a union input answers for its own keys.
type StringlessKeys<Input> =
  IsAny<Input> extends true
    ? never
    : Input extends readonly unknown[]
      ? never
      : Input extends object
        ? {
            [Key in keyof Input]-?: TakesString<Input[Key]> extends true
              ? never
              : Key
          }[keyof Input]
        : never

/** What carries each string-only source, and how its keys are named. */
interface StringCarriers {
  route: ['route param', 'a URL']
  query: ['query key', 'a URL']
  headers: ['header', 'a request header']
}

/**
 * The rule a `route`, `query` or `headers` slot must keep, or `unknown` when
 * it keeps it: every key of every schema's input takes a string, the only
 * value its source carries. A `z.number()` key type-checks a call sending
 * `2`, and then refuses the `'2'` that arrives.
 */
export type StringSlot<Source, T> = Source extends keyof StringCarriers
  ? [
      StringlessKeys<
        InputOf<T extends readonly StandardSchemaV1[] ? T[number] : T>
      >,
    ] extends [never]
    ? unknown
    : InputDeclarationError<`every ${StringCarriers[Source][0]} must take a string as input, which is all ${StringCarriers[Source][1]} carries - read anything else through a coercing schema such as z.coerce.number()`>
  : unknown

// The composition rule first, as its sentence names the shape a tuple must
// have before anything is read of its elements' keys.
type SlotRule<Source, T> =
  ComposableSlot<T> extends infer Rule
    ? unknown extends Rule
      ? StringSlot<Source, T>
      : Rule
    : never

/**
 * The guard a route's `input` intersects with, so a misspelled key beside a
 * valid one is a compile error at that key rather than a source that silently
 * never validates, and a `route`, `query` or `headers` key typed as something
 * no URL or header carries is one at its source.
 */
export type InputGuard<Input> = {
  readonly [Key in keyof Input]: Key extends ValidationSource
    ? SlotRule<Key, Input[Key]>
    : Key extends string
      ? InputDeclarationError<`${Key} is not a validation source - the sources are route, query, headers and body`>
      : never
}
