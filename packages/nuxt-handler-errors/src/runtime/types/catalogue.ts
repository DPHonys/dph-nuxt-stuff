/**
 * The vocabulary a catalogue is written in: the phantom slots, one variant's
 * declaration, the serialization guard that constrains a payload, and the
 * catalogue type itself. Everything here is reachable from a consumer's
 * `defineErrors` call, and so is public API for good.
 */

import type { Serialize } from 'nitropack/types'
import type { IsAny } from './utils'

// ---------------------------------------------------------------------------
// Phantom slots
// ---------------------------------------------------------------------------

/**
 * The slot `payload<T>()` parks its type argument in. A real `Symbol()`
 * because declaration emit drops a non-exported ambient `unique symbol`,
 * silently unbranding every catalogue a consumer imports.
 */
export const PAYLOAD: unique symbol = Symbol('nuxt-handler-errors:payload')

/** The slot a catalogue parks its variant union in. Same reasoning as `PAYLOAD`. */
export const ERRORS: unique symbol = Symbol('nuxt-handler-errors:errors')

/** A variant's payload type, marked. The runtime value is inert. */
export interface Payload<P> {
  readonly [PAYLOAD]?: P
}

// ---------------------------------------------------------------------------
// Declaring a variant
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

/** One entry of a `defineErrors` object literal. */
export interface VariantDef {
  status: ErrorStatus
  payload?: Payload<any>
}

/**
 * The wire-guaranteed floor every variant meets: a string `tag` and a number
 * `status`. Payload keys are unconstrained.
 */
export interface AnyVariant {
  tag: string
  status: number
}

/**
 * A catalogue definition, flattened into the discriminated union it declares.
 * `const` on `defineErrors`' type parameter keeps `status: 404` a `404`.
 */
export type VariantsOf<D extends Record<string, VariantDef>> = {
  [K in keyof D & string]: { tag: K; status: D[K]['status'] } & (D[K] extends {
    payload: Payload<infer P>
  }
    ? P
    : // `{}` is the identity element for `&`.
      // eslint-disable-next-line ts/no-empty-object-type
      {})
}[keyof D & string]

/** One variant's payload fields — the variant minus the two reserved names. */
export type PayloadOf<E extends AnyVariant, T extends E['tag']> = Omit<
  Extract<E, { tag: T }>,
  'tag' | 'status'
>

/**
 * Variadic: a payload-less variant takes **no** second argument, and passing
 * one is an error rather than an ignored extra. Tuple-wrapped never-check, as
 * the type harness requires.
 */
export type PayloadArgs<E extends AnyVariant, T extends E['tag']> = [
  keyof PayloadOf<E, T>,
] extends [never]
  ? []
  : [payload: PayloadOf<E, T>]

// ---------------------------------------------------------------------------
// The serialization guard on `payload<T>()`
// ---------------------------------------------------------------------------

/**
 * Whether one field type survives Nitro's `Serialize` — the authority, so
 * this cannot drift from what the generated map will say. `any` survives;
 * `unknown` and `void` map to `never` silently, so they are named; and
 * `undefined` is excluded first because an optional field is `T | undefined`
 * — without that, `amount?: bigint` walks straight through.
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
 * The top-level payload fields that do not survive `Serialize`. Top-level is
 * a deliberate floor: recursing needs a self-referential index signature,
 * which rejects every named `interface` — the very shape mandated for
 * array-valued payload fields.
 */
export type UnserializablePayloadFields<T> = {
  [K in keyof T]-?: SurvivesSerialization<T[K]> extends true ? never : K
}[keyof T]

/**
 * `payload<T>()`'s constraint: every field must survive JSON serialization —
 * a `bigint` makes `JSON.stringify` throw inside Nitro, turning a declared
 * 403 into an unhandled 500. The clean branch is `unknown`, not `T` (a
 * constraint resolving to its own parameter reports as circular); the failing
 * branch is a missing property whose template-literal type names the field.
 */
export type SerializablePayload<T> = [UnserializablePayloadFields<T>] extends [
  never,
]
  ? unknown
  : {
      __unserializablePayloadField__: `Payload field does not survive JSON serialization: ${UnserializablePayloadFields<T> & string}`
    }

// ---------------------------------------------------------------------------
// Catalogues
// ---------------------------------------------------------------------------

/**
 * A named, reusable set of variants — the product of `defineErrors`, and a
 * real runtime value.
 */
export interface ErrorCatalogue<E extends AnyVariant> {
  readonly [ERRORS]?: E

  /**
   * Narrow the catalogue to the subset this route can actually produce.
   */
  pick: <const K extends readonly E['tag'][]>(
    ...tags: K
  ) => ErrorCatalogue<Extract<E, { tag: K[number] }>>
}

/** The element type of a composition array. */
export type AnyCatalogue = ErrorCatalogue<any>

/** The union declared by a composition array of catalogues. */
export type UnionOfCatalogues<C extends readonly AnyCatalogue[]> = {
  [I in keyof C]: C[I] extends ErrorCatalogue<infer E> ? E : never
}[number]

type IsUnion<T, U = T> = T extends any
  ? [U] extends [T]
    ? false
    : true
  : never

/**
 * The tags declared more than once across composed catalogues. One
 * distributive pass, no tuple recursion — the deferred-generic position is
 * where the compiler gives up. Identical members collapse to one and pass;
 * only a genuine divergence in status or payload trips it.
 */
export type DuplicateTags<E extends AnyVariant> = {
  [K in E['tag']]: IsUnion<Extract<E, { tag: K }>> extends true ? K : never
}[E['tag']]

/**
 * Surfaces a duplicate tag as a missing property whose template-literal type
 * names it verbatim. **Must be intersected FIRST** — `ConflictGuard<C> &
 * { errors: C }`, never the reverse: TypeScript truncates the *tail* of a
 * rendered type, and guard-last buries the message. Measured, and under test.
 */
export type ConflictGuard<C extends readonly AnyCatalogue[]> = [
  DuplicateTags<UnionOfCatalogues<C>>,
] extends [never]
  ? // `{}` is the identity element for `&`.
    // eslint-disable-next-line ts/no-empty-object-type
    {}
  : {
      __duplicateErrorTag__: `Duplicate error tag across composed catalogues: ${DuplicateTags<UnionOfCatalogues<C>> & string}`
    }
