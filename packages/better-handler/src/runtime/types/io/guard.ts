import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { IsAny } from '../utils'
import type { OutputOf, ValidationSource } from './input'

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

/**
 * The guard a route's `input` intersects with, so a misspelled key beside a
 * valid one is a compile error at that key rather than a source that silently
 * never validates.
 */
export type InputGuard<Input> = {
  readonly [Key in keyof Input]: Key extends ValidationSource
    ? ComposableSlot<Input[Key]>
    : Key extends string
      ? InputDeclarationError<`${Key} is not a validation source - the sources are route, query, headers and body`>
      : never
}
