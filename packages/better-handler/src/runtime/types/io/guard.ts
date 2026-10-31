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

/** The keys of any member of a union: distributes, unlike bare `keyof`. */
type KeysOfUnion<T> = T extends unknown ? keyof T : never

// One key, unless it is the whole key space an index signature contributes.
type NamedKey<Key> = string extends Key
  ? never
  : number extends Key
    ? never
    : symbol extends Key
      ? never
      : Key

// An index signature widens `keyof` and takes every named key down with it,
// so a passthrough output would collide with every sibling. It contributes
// nothing here instead, and the runtime's later-wins merge stands behind it.
type NamedKeys<T> = NamedKey<KeysOfUnion<T>>

type ElementOutputs<T extends readonly StandardSchemaV1[]> = {
  [Index in keyof T]: OutputOf<T[Index]>
}

/** Whether any two of a tuple's outputs share a named key. */
// Head against the union of the rest: pairwise without the quadratic spelling.
export type HasKeyOverlap<Outputs extends readonly unknown[]> =
  Outputs extends readonly [
    infer Head,
    ...infer Rest extends readonly unknown[],
  ]
    ? [NamedKeys<Head> & NamedKeys<Rest[number]>] extends [never]
      ? HasKeyOverlap<Rest>
      : true
    : false

/**
 * Whether an output can be merged with its siblings': an object that is not
 * an array or a function. Structural, so a `Date` or `Map` output passes here
 * and is the runtime merge's to refuse. `any` is answered before the
 * distribution, which would otherwise send it down both branches.
 */
export type IsMergeableOutput<Output> =
  IsAny<Output> extends true
    ? true
    : Output extends object
      ? Output extends readonly unknown[] | ((...args: never[]) => void)
        ? false
        : true
      : false

/**
 * The rule a composed slot must keep, or `unknown` when it keeps it: every
 * element produces an object, and no two share an output key. The object
 * rule runs first: on a primitive output the overlap check would compare
 * `String.prototype`'s keys and print the wrong sentence.
 */
export type ComposableSlot<T> = T extends readonly [StandardSchemaV1]
  ? unknown
  : T extends readonly [StandardSchemaV1, ...StandardSchemaV1[]]
    ? [IsMergeableOutput<OutputOf<T[number]>>] extends [true]
      ? HasKeyOverlap<ElementOutputs<T>> extends true
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
