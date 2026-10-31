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
