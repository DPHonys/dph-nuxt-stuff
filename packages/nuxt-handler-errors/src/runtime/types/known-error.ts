/**
 * The vocabulary a failure is declared in: the phantom slots, one variant's
 * definition, the serialization guard on a payload, the error value itself and
 * the divergence guard over a composed slot.
 *
 * The unit is the **variant as a value**; a group is nothing but an array of
 * those values, so everything downstream reads a union off an element type and
 * spread is the only composition operator.
 */

import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Serialize } from 'nitropack/types'
import type { IsAny, IsUnion } from './utils'

// ---------------------------------------------------------------------------
// Phantom slots
// ---------------------------------------------------------------------------

/**
 * The slot `payload<T>()` parks its type argument in. A real `Symbol()`
 * because declaration emit drops a non-exported ambient `unique symbol`,
 * silently unbranding every definition a consumer imports.
 */
export const PAYLOAD: unique symbol = Symbol('nuxt-handler-errors:payload')

/** A variant's payload type, marked. The runtime value is inert. */
export interface Payload<P> {
  readonly [PAYLOAD]?: P
}

/**
 * The slot a `KnownError` parks its variant in. Same reasoning as
 * {@link PAYLOAD}, and **required** rather than optional: an optional phantom
 * makes `KnownError` a weak type that every object structurally matches, and
 * the extraction conditionals downstream would then match records, groups and
 * garbage alike. Nothing carries this at runtime — the implementation casts,
 * and the *runtime* brand is a separate, module-private symbol.
 */
export const VARIANT: unique symbol = Symbol('nuxt-handler-errors:variant')

// ---------------------------------------------------------------------------
// Defining a variant
// ---------------------------------------------------------------------------

/**
 * The common 4xx/5xx literals unioned with `(number & {})`, so `status` gets
 * completions without closing the set. Deliberately no default: a defaulted
 * 400 makes a variant's status invisible where it is declared.
 */
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
  // The open arm. `number` alone would swallow the literal completions above.
  | (number & {})

/**
 * What may sit in the `payload` position: the no-library `payload<T>()`
 * phantom, or any Standard Schema value (`zod`, `valibot`, anything carrying
 * `~standard`). **A schema here is never executed by this package** — it is
 * read for its inferred output type and nothing else.
 */
export type PayloadSlot = Payload<any> | StandardSchemaV1

/** One entry of a `defineError` definition object. */
export interface VariantDef {
  status: ErrorStatus
  payload?: PayloadSlot
}

/** A definition record — the many-at-once form of `defineError`. */
export type Defs = Record<string, VariantDef>

/**
 * The wire-guaranteed floor every variant meets: a string `tag` and a number
 * `status`. Payload keys are unconstrained.
 */
export interface KnownVariant {
  tag: string
  status: number
}

/**
 * A definition's payload type, from whichever door it came through. The schema
 * arm is tested **first**: `Payload<P>` is all-optional, so a weak-type check
 * against it is not a reliable way to tell a schema from a phantom.
 */
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

/**
 * Variadic: a payload-less variant takes **no** second argument, and passing
 * one is an error rather than an ignored extra.
 */
export type PayloadArgs<E extends KnownVariant, T extends E['tag']> = [
  keyof PayloadOf<E, T>,
] extends [never]
  ? []
  : [payload: PayloadOf<E, T>]

// ---------------------------------------------------------------------------
// The serialization guard on `payload<T>()`
// ---------------------------------------------------------------------------

/**
 * Whether one field type survives Nitro's `Serialize` — the authority, so this
 * cannot drift from what the generated map will say. `any` survives;
 * `unknown` and `void` map to `never` silently, so they are named; and
 * `undefined` is excluded first because an optional field is `T | undefined` —
 * without that, `amount?: bigint` walks straight through.
 */
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

/**
 * The top-level payload fields that do not survive `Serialize`. Top-level is a
 * deliberate floor: recursing needs a self-referential index signature, which
 * rejects every named `interface` — the very shape mandated for array-valued
 * payload fields.
 */
export type UnserializablePayloadFields<T> = {
  [K in keyof T]-?: SurvivesSerialization<T[K]> extends true ? never : K
}[keyof T]

/**
 * `payload<T>()`'s constraint: every field must survive JSON serialization — a
 * `bigint` makes `JSON.stringify` throw inside Nitro, turning a declared 403
 * into an unhandled 500. The clean branch is `unknown`, not `T` (a constraint
 * resolving to its own parameter reports as circular); the failing branch is a
 * missing property whose template-literal type names the field.
 */
export type SerializablePayload<T> = [UnserializablePayloadFields<T>] extends [
  never,
]
  ? unknown
  : {
      __unserializablePayloadField__: `Payload field does not survive JSON serialization: ${UnserializablePayloadFields<T> & string}`
    }

/**
 * The same guard, applied to a whole definition — which is where the **schema**
 * door is reachable. `payload<T>()` carries its own constraint, but a Standard
 * Schema arrives already built and its inferred output would otherwise walk in
 * unchecked. Written over {@link PayloadTypeOf} so both doors are held to one
 * rule: whatever `payload<T>()` rejects, a schema inferring the same `T` is
 * rejected for too.
 */
export type SerializableDef<D extends VariantDef> = [
  UnserializablePayloadFields<PayloadTypeOf<D>>,
] extends [never]
  ? // eslint-disable-next-line ts/no-empty-object-type
    {}
  : {
      __unserializablePayloadField__: `Payload field does not survive JSON serialization: ${UnserializablePayloadFields<PayloadTypeOf<D>> & string}`
    }

/**
 * {@link SerializableDef} over a definition record: the failing branch names
 * the tag, because a record's fields all read alike and the field name alone
 * would not say which variant to look at.
 */
export type SerializableDefs<D extends Defs> = [
  UnserializableDefTags<D>,
] extends [never]
  ? // eslint-disable-next-line ts/no-empty-object-type
    {}
  : {
      __unserializablePayloadField__: `Payload does not survive JSON serialization: ${UnserializableDefTags<D> & string}`
    }

/** The tags in a record whose payload has a field `Serialize` drops. */
type UnserializableDefTags<D extends Defs> = {
  [K in keyof D]: [UnserializablePayloadFields<PayloadTypeOf<D[K]>>] extends [
    never,
  ]
    ? never
    : K
}[keyof D]

// ---------------------------------------------------------------------------
// The error value, and a group of them
// ---------------------------------------------------------------------------

/** One declared failure as a value — what `defineError` returns for a single. */
export interface KnownError<E extends KnownVariant> {
  readonly [VARIANT]: E
}

/**
 * A group: an array of singles over the union, plus the subsetting method.
 * `pick` takes any number of tags and is **deliberately permissive** about
 * repetition and emptiness — `K[number]` is a union, and a union dedupes
 * itself, so a tag listed twice narrows to exactly what listing it once does.
 * Only a tag the group never declared is a compile error. The contract is on
 * the return: the runtime hands back one error per distinct tag.
 */
export interface KnownErrorGroup<E extends KnownVariant> extends ReadonlyArray<
  KnownError<E>
> {
  pick: <const K extends readonly E['tag'][]>(
    ...tags: K
  ) => KnownErrorGroup<Extract<E, { tag: K[number] }>>
}

/** The element type of a composed errors slot. */
export type AnyKnownError = KnownError<KnownVariant>

/**
 * The union declared by an errors slot. One conditional over the **element**
 * union — which is all a slot of singles ever needs, and why spread composes
 * with no combinator of ours.
 */
export type KnownErrorsOf<A extends ReadonlyArray<AnyKnownError>> =
  A[number] extends infer M
    ? M extends KnownError<infer E>
      ? E
      : never
    : never

// ---------------------------------------------------------------------------
// The divergence guard
// ---------------------------------------------------------------------------

/**
 * The tags whose variants appear more than once in a slot's union. A variant
 * listed twice **identically** collapses when the union forms and never
 * reaches this — repetition stays free. Only the same tag declared again with
 * a different status or payload survives as two members sharing one
 * discriminant, which breaks `fail`'s payload lookup and the matcher's arms
 * alike: a genuine bug, not a redundancy.
 */
export type DivergentTags<E extends KnownVariant> = {
  [K in E['tag']]: IsUnion<Extract<E, { tag: K }>> extends true ? K : never
}[E['tag']]

/**
 * Surfaces a divergent tag as a missing property whose template-literal type
 * names it verbatim. **Must be intersected FIRST** — `ConflictGuard<A> &
 * { errors: A }`, never the reverse: TypeScript truncates the *tail* of a
 * rendered type, and guard-last buries the message. Measured.
 */
export type ConflictGuard<A extends ReadonlyArray<AnyKnownError>> = [
  DivergentTags<KnownErrorsOf<A>>,
] extends [never]
  ? // `{}` is the identity element for `&`.
    // eslint-disable-next-line ts/no-empty-object-type
    {}
  : {
      __divergentErrorTag__: `Tag declared more than once with different shapes: ${DivergentTags<KnownErrorsOf<A>> & string}`
    }
