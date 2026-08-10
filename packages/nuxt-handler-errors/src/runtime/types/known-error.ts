import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Serialize } from 'nitropack/types'
import type { IsAny, IsUnion } from './utils'

// A real `Symbol()` because declaration emit drops a non-exported ambient
// `unique symbol`, silently unbranding every definition a consumer imports.
export const PAYLOAD: unique symbol = Symbol('nuxt-handler-errors:payload')

/** A variant's payload type, marked. The runtime value is inert. */
export interface Payload<P> {
  readonly [PAYLOAD]?: P
}

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

/**
 * What may sit in the `payload` position: the `payload<T>()` phantom, or any
 * Standard Schema value — read for its inferred output type, never executed.
 */
export type PayloadSlot = Payload<any> | StandardSchemaV1

/** One entry of a `defineError` definition object. */
export interface VariantDef {
  status: ErrorStatus
  payload?: PayloadSlot
}

/** A definition record — the many-at-once form of `defineError`. */
export type Defs = Record<string, VariantDef>

/** The floor every variant meets: a `tag` and a `status`. */
export interface KnownVariant {
  tag: string
  status: number
}

// The schema arm is tested first: `Payload<P>` is all-optional, so a weak-type
// check against it cannot reliably tell a schema from a phantom.
export type PayloadTypeOf<D extends VariantDef> = D extends {
  payload: infer S extends StandardSchemaV1
}
  ? StandardSchemaV1.InferOutput<S>
  : D extends { payload: Payload<infer P> }
    ? P
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
  [K in keyof D & string]: VariantOfDef<K, D[K]>
}[keyof D & string]

/** One variant's payload fields — the variant minus the two reserved names. */
export type PayloadOf<E extends KnownVariant, T extends E['tag']> = Omit<
  Extract<E, { tag: T }>,
  'tag' | 'status'
>

/** Variadic: a payload-less variant takes no second argument at all. */
export type PayloadArgs<E extends KnownVariant, T extends E['tag']> = [
  keyof PayloadOf<E, T>,
] extends [never]
  ? []
  : [payload: PayloadOf<E, T>]

// `undefined` is excluded first because an optional field is `T | undefined` —
// without that, `amount?: bigint` walks straight through.
type SurvivesSerialization<V> =
  IsAny<V> extends true
    ? true
    : unknown extends V
      ? false
      : [V] extends [void]
        ? false
        : [Serialize<Exclude<V, undefined>>] extends [never]
          ? false
          : true

/** The top-level payload fields that do not survive Nitro's `Serialize`. */
export type UnserializablePayloadFields<T> = {
  [K in keyof T]-?: SurvivesSerialization<T[K]> extends true ? never : K
}[keyof T]

// Every field must survive JSON serialization — a `bigint` makes
// `JSON.stringify` throw inside Nitro, turning a declared 403 into a 500.
export type SerializablePayload<T> = [UnserializablePayloadFields<T>] extends [
  never,
]
  ? unknown
  : {
      __unserializablePayloadField__: `Payload field does not survive JSON serialization: ${UnserializablePayloadFields<T> & string}`
    }

// The same guard over a whole definition — where a Standard Schema's
// inferred output would otherwise walk in unchecked.
export type SerializableDef<D extends VariantDef> = [
  UnserializablePayloadFields<PayloadTypeOf<D>>,
] extends [never]
  ? // eslint-disable-next-line ts/no-empty-object-type
    {}
  : {
      __unserializablePayloadField__: `Payload field does not survive JSON serialization: ${UnserializablePayloadFields<PayloadTypeOf<D>> & string}`
    }

// Over a definition record; the failure names the tag.
export type SerializableDefs<D extends Defs> = [
  UnserializableDefTags<D>,
] extends [never]
  ? // eslint-disable-next-line ts/no-empty-object-type
    {}
  : {
      __unserializablePayloadField__: `Payload does not survive JSON serialization: ${UnserializableDefTags<D> & string}`
    }

type UnserializableDefTags<D extends Defs> = {
  [K in keyof D]: [UnserializablePayloadFields<PayloadTypeOf<D[K]>>] extends [
    never,
  ]
    ? never
    : K
}[keyof D]

/** One declared failure as a value — what `defineError` returns for a single. */
export interface KnownError<E extends KnownVariant> {
  readonly [VARIANT]: E
}

/** A group: an array of singles, plus `pick` to subset it by tag. */
export interface KnownErrorGroup<E extends KnownVariant> extends ReadonlyArray<
  KnownError<E>
> {
  /** Narrow the group to the given tags. Unknown tags are a compile error. */
  pick: <const K extends readonly E['tag'][]>(
    ...tags: K
  ) => KnownErrorGroup<Extract<E, { tag: K[number] }>>
}

/** The element type of a composed errors slot. */
export type AnyKnownError = KnownError<KnownVariant>

/** The union declared by an errors slot. */
export type KnownErrorsOf<A extends ReadonlyArray<AnyKnownError>> =
  A[number] extends infer M
    ? M extends KnownError<infer E>
      ? E
      : never
    : never

// Identical redeclarations collapse when the union forms and never reach
// this — only the same tag declared with a different status or payload
// survives as two members sharing one discriminant.
export type DivergentTags<E extends KnownVariant> = {
  [K in E['tag']]: IsUnion<Extract<E, { tag: K }>> extends true ? K : never
}[E['tag']]

// Surfaces a divergent tag as a missing property naming it. Must be
// intersected FIRST (`ConflictGuard<A> & { errors: A }`) — TypeScript
// truncates the tail of a rendered type, and guard-last buries the message.
export type ConflictGuard<A extends ReadonlyArray<AnyKnownError>> = [
  DivergentTags<KnownErrorsOf<A>>,
] extends [never]
  ? // eslint-disable-next-line ts/no-empty-object-type
    {}
  : {
      __divergentErrorTag__: `Tag declared more than once with different shapes: ${DivergentTags<KnownErrorsOf<A>> & string}`
    }
