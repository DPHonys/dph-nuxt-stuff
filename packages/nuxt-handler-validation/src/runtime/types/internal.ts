import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { OutputOf, ValidationSource } from './index'

/**
 * A rule the declaration broke. Nothing the author wrote can satisfy it, so the
 * diagnostic prints at the offending source key with this message inside it.
 */
export interface ValidationDeclarationError<Msg extends string> {
  'validation-declaration-error': Msg
}

/** The keys of any member of a union - distributes, unlike bare `keyof`. */
type KeysOfUnion<T> = T extends unknown ? keyof T : never

// One key, unless it is the whole key space an index signature contributes.
type NamedKey<K> = string extends K
  ? never
  : number extends K
    ? never
    : symbol extends K
      ? never
      : K

// An index signature widens `keyof` and takes every named key down with it, so
// a passthrough output would collide with every sibling. It contributes nothing
// here instead, and the runtime's later-wins spread stands behind it.
type NamedKeys<T> = NamedKey<KeysOfUnion<T>>

// `1 & T` collapses to `any` only when `T` already is, and `0 extends any` is
// the one case that holds. Exported for `RequestInputOfHandler` next door,
// which does not re-export it: `/types` keeps no `IsAny`.
export type IsAny<T> = 0 extends 1 & T ? true : false

type ElementOutputs<T extends readonly StandardSchemaV1[]> = {
  [I in keyof T]: OutputOf<T[I]>
}

// Head against the union of the rest: pairwise without the quadratic spelling.
type HasKeyOverlap<Outputs extends readonly unknown[]> =
  Outputs extends readonly [
    infer Head,
    ...infer Rest extends readonly unknown[],
  ]
    ? [NamedKeys<Head> & NamedKeys<Rest[number]>] extends [never]
      ? HasKeyOverlap<Rest>
      : true
    : false

// Structural rather than `Record<string, unknown>`, because interfaces carry no
// implicit index signature; the cost is that a `Date` or `Map` output passes
// here and is the runtime merge's to refuse. `any` is answered before the
// distribution, which would otherwise send it down both branches and refuse it.
type IsMergeableOutput<O> =
  IsAny<O> extends true
    ? true
    : O extends object
      ? O extends readonly unknown[] | ((...args: never[]) => void)
        ? false
        : true
      : false

// The object rule runs first: on a non-object output the overlap check would
// compare `String.prototype`'s keys and print the wrong sentence.
type ComposableSlot<T> = T extends readonly [StandardSchemaV1]
  ? unknown
  : T extends readonly [StandardSchemaV1, ...StandardSchemaV1[]]
    ? [IsMergeableOutput<OutputOf<T[number]>>] extends [true]
      ? HasKeyOverlap<ElementOutputs<T>> extends true
        ? ValidationDeclarationError<'schemas composed on one source must produce disjoint output keys - merge them in your schema library instead'>
        : unknown
      : ValidationDeclarationError<'every schema composed on one source must produce an object output - not a primitive, an array or a function'>
    : unknown

/**
 * The guard the `input` parameter intersects with, so a misspelled key
 * beside a valid one is a compile error at that key rather than a source that
 * silently never validates.
 */
export type ValidationSchemasGuard<S> = {
  [K in keyof S]: K extends ValidationSource
    ? ComposableSlot<S[K]>
    : K extends string
      ? ValidationDeclarationError<`'${K}' is not a validation source - the sources are routerParams, query, headers and body`>
      : never
}
