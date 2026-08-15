/**
 * The declaration guard - internal machinery behind `defineValidatedEventHandler`.
 * A consumer meets these types in a diagnostic and fixes the declaration,
 * never names them; nothing here is re-exported from `./index`, so nothing
 * here reaches a public entry.
 *
 * This file is the whole replacement for v1's `composition.ts` + `guard.ts`.
 * Every rule fires **at the declaration, at the offending key** - there are no
 * lazy poisons that wait for a property access, because with composition
 * scoped to one source in one place, the error site and the mistake site are
 * the same place.
 */
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { OutputOf, ValidationSource } from './index'

/**
 * A rule the declaration broke, carrying the sentence that says what the
 * author did. The value the author wrote can never satisfy it, so the
 * diagnostic prints at the offending source key with this message inside it.
 */
export interface ValidationDeclarationError<Msg extends string> {
  'validation-declaration-error': Msg
}

/** The keys of any member of a union - distributes, unlike bare `keyof`. */
type KeysOfUnion<T> = T extends unknown ? keyof T : never

/**
 * One key, unless it is the whole key space - `string`, `number` or `symbol`
 * itself, which is what an index signature contributes to `keyof`.
 */
type NamedKey<K> = string extends K
  ? never
  : number extends K
    ? never
    : symbol extends K
      ? never
      : K

/**
 * The keys an output actually **names**, which is the only thing an overlap can
 * be proven from.
 *
 * An index signature widens `keyof` to `string | number` and takes every named
 * key down with it (`keyof ({ page: number } & Record<string, unknown>)` is
 * `string | number`, not `'page' | string`), so comparing raw keys would make a
 * passthrough or record output collide with every sibling - a refusal whose
 * sentence names the wrong cause and whose advice does not apply. Such an
 * output contributes nothing here instead: the guard cannot prove that merge
 * overlaps, and decision 6's later-wins spread is what stands behind the ones
 * it cannot see.
 */
type NamedKeys<T> = NamedKey<KeysOfUnion<T>>

/**
 * Whether a type is `any`: `1 & T` collapses to `any` only when `T` already is,
 * and `0 extends any` is the one case that holds.
 */
type IsAny<T> = 0 extends 1 & T ? true : false

/** The tuple of a composed slot's element outputs, positions preserved. */
type ElementOutputs<T extends readonly StandardSchemaV1[]> = {
  [I in keyof T]: OutputOf<T[I]>
}

/**
 * Whether any two elements of the tuple share an output key - head against
 * the union of the rest, then recurse, which is pairwise without the
 * quadratic spelling.
 */
type HasKeyOverlap<Outputs extends readonly unknown[]> =
  Outputs extends readonly [
    infer Head,
    ...infer Rest extends readonly unknown[],
  ]
    ? [NamedKeys<Head> & NamedKeys<Rest[number]>] extends [never]
      ? HasKeyOverlap<Rest>
      : true
    : false

/**
 * Whether one output type can take part in a merge: any object that is not an
 * array or a function. The test is **structural**, not `Record<string,
 * unknown>` - interfaces carry no implicit index signature, and a schema
 * typed off an interface (a `z.custom<ThirdParty>()`, a hand-written Standard
 * Schema) must not be falsely refused. The cost, accepted: an exotic object
 * output (`Date`, `Map`) passes this gate and is the runtime merge's to
 * refuse.
 *
 * Distributes, so a union output qualifies only if **every** member does -
 * except for `any`, which is answered before the distribution can happen.
 * `any` matches both branches of every conditional, so it would distribute to
 * `boolean` and be refused; decision 6 names an `any`-typed schema as a case
 * the **runtime** merge exists to handle, which a compile-time refusal here
 * would make unreachable from typed code.
 */
type IsMergeableOutput<O> =
  IsAny<O> extends true
    ? true
    : O extends object
      ? O extends readonly unknown[] | ((...args: never[]) => unknown)
        ? false
        : true
      : false

/**
 * The two composition rules, checked only where composition happens - a tuple
 * of two or more. A lone schema (bare or `[x]`) has nothing to merge, so any
 * output type passes through, primitives included.
 *
 * The object rule runs **first**: on a non-object output the overlap check
 * would compare `String.prototype`'s keys and print the wrong sentence.
 */
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
 * The guard the `validate` parameter intersects with. A misspelled key
 * **beside a valid one** is a compile error at that key - carrying a sentence
 * that names the four sources, not a bare `never` - rather than a source that
 * silently never validates; every source key must pass the composition rules.
 */
export type ValidationSchemasGuard<S> = {
  [K in keyof S]: K extends ValidationSource
    ? ComposableSlot<S[K]>
    : K extends string
      ? ValidationDeclarationError<`'${K}' is not a validation source - the sources are routerParams, query, headers and body`>
      : never
}
