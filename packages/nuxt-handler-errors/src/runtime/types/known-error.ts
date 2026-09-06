import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { H3Error } from 'h3'
import type { IsAny, IsUnion } from './utils'

// Required rather than optional: an optional phantom makes `KnownError` a weak
// type every object structurally matches. Nothing carries this at runtime.
export const VARIANT: unique symbol = Symbol('nuxt-handler-errors:variant')

/** The common 4xx/5xx literals, with any other number still allowed. */
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
  | (number & {})

/** One entry of a `defineError` definition object. */
export interface VariantDef {
  status: ErrorStatus
  /** Any Standard Schema; validated at runtime when the factory is called. */
  payload?: StandardSchemaV1
}

/** A definition record - the many-at-once form of `defineError`. */
export type Defs = Record<string, VariantDef>

/** The floor every variant meets: a `tag` and a `status`. */
export interface KnownVariant {
  tag: string
  status: number
}

export type PayloadTypeOf<D extends VariantDef> = D extends {
  payload: infer S extends StandardSchemaV1
}
  ? StandardSchemaV1.InferOutput<S>
  : // `{}` is the identity element for `&`.
    // eslint-disable-next-line ts/no-empty-object-type
    {}

/** One definition, flattened into its variant. */
export type VariantOfDef<Tag extends string, D extends VariantDef> = {
  tag: Tag
  status: D['status']
} & PayloadTypeOf<D>

/** A definition record, flattened into the union it declares. */
export type VariantsOf<D extends Defs> = {
  [K in keyof D & (string | number)]: VariantOfDef<`${K}`, D[K]>
}[keyof D & (string | number)]

// Invariant callables retain whole declarations, including union outputs and
// input/output subtypes that would otherwise collapse. Metadata only, never called.
export interface InputOfDef<Tag extends string, D extends VariantDef> {
  tag: Tag
  input: (...args: ArgsOfDef<D>) => ArgsOfDef<D>
  output: (value: VariantOfDef<Tag, D>) => VariantOfDef<Tag, D>
}

type KeysOfUnion<T> = T extends T ? keyof T : never

type ArgsOfDef<D extends VariantDef> = D extends {
  payload: infer S extends StandardSchemaV1
}
  ? [payload: StandardSchemaV1.InferInput<S>]
  : []

export type InputsOfDefs<D extends Defs> = {
  [K in keyof D & (string | number)]: InputOfDef<`${K}`, D[K]>
}[keyof D & (string | number)]

export interface FactoryInput {
  tag: string
  input: (...args: any[]) => any
  output: (value: any) => any
}
type DefaultInputs<E extends KnownVariant> = {
  [K in E['tag']]: {
    tag: K
    input: (...args: PayloadArgs<E, K>) => PayloadArgs<E, K>
    output: (value: Extract<E, { tag: K }>) => Extract<E, { tag: K }>
  }
}[E['tag']]

type InputsOf<A extends readonly AnyKnownError[]> = A[number] extends infer M
  ? M extends KnownError<any, infer I>
    ? I
    : never
  : never

export type ErrorFactories<A extends readonly AnyKnownError[]> = {
  readonly [K in KnownErrorsOf<A>['tag']]: (
    ...args: Parameters<Extract<InputsOf<A>, { tag: K }>['input']>
  ) => H3Error
}

/** One variant's payload fields - the variant minus the two reserved names. */
export type PayloadOf<E extends KnownVariant, T extends E['tag']> = E extends {
  tag: T
}
  ? Omit<E, 'tag' | 'status'>
  : never

/** Variadic: a payload-less variant takes no second argument at all. */
export type PayloadArgs<E extends KnownVariant, T extends E['tag']> = [
  KeysOfUnion<PayloadOf<E, T>>,
] extends [never]
  ? []
  : [payload: PayloadOf<E, T>]

type Chars<S extends string> = S extends `${infer C}${infer R}`
  ? C | Chars<R>
  : never

// Chunked: one long literal trips the instantiation-depth limit.
type Lower = Chars<'abcdefghijklm'> | Chars<'nopqrstuvwxyz'>
type IdentifierStart = Lower | Uppercase<Lower> | '_' | '$'
type IdentifierChar = IdentifierStart | Chars<'0123456789'>

type IdentifierTail<S extends string> = S extends ''
  ? true
  : S extends `${infer C}${infer R}`
    ? C extends IdentifierChar
      ? IdentifierTail<R>
      : false
    : false

// A tag is a factory property, so it must be spellable as `errors.tag`.
// ASCII only, matching the runtime regex: `Δ` is a legal identifier to
// JavaScript but not a tag.
export type IsIdentifier<T extends string> = string extends T
  ? false
  : T extends `${infer C}${infer R}`
    ? C extends IdentifierStart
      ? IdentifierTail<R>
      : false
    : false

/** The guard on a single tag; the failure names the tag. */
export type ValidTag<T extends string> =
  IsIdentifier<T> extends true
    ? unknown
    : {
        __invalidTag__: `Tag must be a valid identifier so it can be written as errors.tag: ${T}`
      }

// The guard over a whole definition, where a Standard Schema's inferred
// output would otherwise walk in unchecked.
export type ValidDef<D extends VariantDef> = ValidPayload<PayloadTypeOf<D>> &
  (Exclude<keyof D, 'status' | 'payload'> extends never
    ? unknown
    : { __invalidDefinition__: 'Only status and payload are supported' })

// Over a definition record; each failure names the tag.
export type ValidDefs<D extends Defs> = (Extract<keyof D, symbol> extends never
  ? unknown
  : never) &
  ([InvalidPayloadTags<D>] extends [never]
    ? unknown
    : {
        __invalidPayload__: `Payload must be a serializable object without tag, status, or toJSON fields: ${InvalidPayloadTags<D> & string}`
      }) &
  ([InvalidTags<D>] extends [never]
    ? // eslint-disable-next-line ts/no-empty-object-type
      {}
    : {
        __invalidTag__: `Tag must be a valid identifier so it can be written as errors.tag: ${InvalidTags<D> & string}`
      })

type InvalidPayloadTags<D extends Defs> = {
  [K in keyof D]: unknown extends ValidDef<D[K]> ? never : K
}[keyof D]

type InvalidTags<D extends Defs> = {
  [K in keyof D & (string | number)]: IsIdentifier<`${K}`> extends true
    ? never
    : K
}[keyof D & (string | number)]

// Local and bounded: do not recursively inspect the generated route union.
type JsonOutput<T, Depth extends unknown[] = []> =
  IsAny<T> extends true
    ? true
    : unknown extends T
      ? false
      : T extends string | number | boolean | null
        ? true
        : T extends bigint | symbol | undefined | ((...args: any[]) => any)
          ? false
          : Depth['length'] extends 8
            ? true
            : T extends { toJSON: (...args: any[]) => infer Output }
              ? JsonOutput<Output, [...Depth, unknown]>
              : T extends readonly (infer Item)[]
                ? JsonOutput<Item, [...Depth, unknown]>
                : T extends object
                  ? {
                      [K in keyof T]-?: JsonOutput<
                        Exclude<T[K], undefined>,
                        [...Depth, unknown]
                      >
                    }[keyof T]
                  : false

type ReservedFields<T> = {
  [K in 'tag' | 'status' | 'toJSON']: K extends keyof T
    ? [T[K]] extends [never]
      ? never
      : K
    : never
}['tag' | 'status' | 'toJSON']

type InvalidPayload<T> = T extends object
  ? T extends readonly unknown[] | ((...args: any[]) => any)
    ? true
    : ReservedFields<T> extends never
      ? false extends JsonOutput<T>
        ? true
        : false
      : true
  : true

type ValidPayload<T> =
  true extends InvalidPayload<T>
    ? {
        __invalidPayload__: 'Payload must be a serializable object without tag, status, or toJSON fields'
      }
    : unknown

/** One declared failure as a value - what `defineError` returns for a single. */
export interface KnownError<
  E extends KnownVariant,
  Inputs extends FactoryInput = DefaultInputs<E>,
> {
  readonly [VARIANT]: { output: E; inputs: Inputs }
}

/** A group: an array of singles, plus `pick` to subset it by tag. */
export interface KnownErrorGroup<
  E extends KnownVariant,
  Inputs extends FactoryInput = DefaultInputs<E>,
> extends ReadonlyArray<KnownError<E, Inputs>> {
  /** Narrow the group to the given tags. Unknown tags are a compile error. */
  pick: <const K extends readonly E['tag'][]>(
    ...tags: K
  ) => KnownErrorGroup<
    Extract<E, { tag: K[number] }>,
    Extract<Inputs, { tag: K[number] }>
  >
}

/** The element type of a composed errors slot. */
export type AnyKnownError = KnownError<KnownVariant, FactoryInput>

/** The union declared by an errors slot. */
export type KnownErrorsOf<A extends ReadonlyArray<AnyKnownError>> =
  A[number] extends infer M
    ? M extends KnownError<infer E, any>
      ? E
      : never
    : never

// Count declaration metadata, not flattened payload union members.
type DivergentTags<I extends FactoryInput> = {
  [K in I['tag']]: IsUnion<Extract<I, { tag: K }>> extends true ? K : never
}[I['tag']]

// Surfaces a divergent tag as a missing property naming it. Must be
// intersected FIRST (`ConflictGuard<A> & { errors: A }`) - TypeScript
// truncates the tail of a rendered type, and guard-last buries the message.
export type ConflictGuard<A extends ReadonlyArray<AnyKnownError>> = [
  DivergentTags<InputsOf<A>>,
] extends [never]
  ? // eslint-disable-next-line ts/no-empty-object-type
    {}
  : {
      __divergentErrorTag__: `Tag declared more than once with different shapes: ${DivergentTags<InputsOf<A>> & string}`
    }
