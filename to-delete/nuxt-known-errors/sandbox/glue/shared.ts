// The pieces the glue redesign keeps UNCHANGED.
//
// `p2-array-spread.ts` varies only the glue between defining an error and
// listing it on a handler — `payload` and `fail` are held fixed by direction,
// and this file is what holding them fixed means. Reduced exactly as
// `../fixtures.ts` reduces the framework: enough to type the call sites,
// nothing more. The serialization guard on `payload<T>()` is elided — it
// constrains `T`, not the glue.
//
// Four sibling proposals (record→object slot, unified sets, record→member
// access, the do-everything hybrid) were built here, compared, and deleted
// once array+pick won — their reasons live in DESIGN.md's git history. This
// directory folds into the main sandbox files when internals start.

export type { H3Event } from '../fixtures'

// --- `payload`, kept -------------------------------------------------------

export declare const PAYLOAD: unique symbol

/** A variant's payload type, marked. The runtime value is inert. */
export interface Payload<P> {
  readonly [PAYLOAD]?: P
}

export declare function payload<T>(): Payload<T>

// --- One definition entry --------------------------------------------------

/** One entry of a definition object literal. No status default, as before. */
export interface VariantDef {
  status: number
  payload?: Payload<any>
}

export type Defs = Record<string, VariantDef>

/** The wire floor, unchanged from `../matcher.ts`'s `KnownVariant`. */
export interface KnownVariant {
  tag: string
  status: number
}

/** One def entry, flattened into its variant. */
export type VariantOfDef<Tag extends string, D extends VariantDef> = {
  tag: Tag
  status: D['status']
} & (D extends { payload: Payload<infer P> }
  ? P
  : // `{}` is the identity element for `&`.
    // eslint-disable-next-line ts/no-empty-object-type
    {})

/** A defs record, flattened into its union. */
export type VariantsOf<D extends Defs> = {
  [K in keyof D & string]: VariantOfDef<K, D[K]>
}[keyof D & string]

// --- The single error value ------------------------------------------------

/**
 * The brand is REQUIRED, not optional. An optional phantom makes `KnownError`
 * a weak type that every object structurally matches, and every proposal's
 * extraction conditional (`T extends KnownError<infer E>`) would then match
 * groups, records and garbage alike, inferring `unknown` — the §4 class of
 * silent bug. The implementation attaches a runtime marker or casts, exactly
 * as the old catalogue's `buildCatalogue` cast past its phantom.
 */
export declare const VARIANT: unique symbol

/** One declared failure as a value — what `defineError` returns for a single. */
export interface KnownError<E extends KnownVariant> {
  readonly [VARIANT]: E
}

// --- `fail`, kept ----------------------------------------------------------

/** One variant's payload fields — the variant minus the two reserved names. */
export type PayloadOf<E extends KnownVariant, T extends E['tag']> = Omit<
  Extract<E, { tag: T }>,
  'tag' | 'status'
>

/** Variadic: a payload-less variant takes NO second argument. */
export type PayloadArgs<E extends KnownVariant, T extends E['tag']> = [
  keyof PayloadOf<E, T>,
] extends [never]
  ? []
  : [payload: PayloadOf<E, T>]

/** Scoped to exactly the declared union; throws, so it returns `never`. */
export type Fail<E extends KnownVariant> = <T extends E['tag']>(
  tag: T,
  ...payload: PayloadArgs<E, T>
) => never

/** The second argument a typed handler body receives. */
export interface HandlerContext<E extends KnownVariant> {
  fail: Fail<E>
}

/** The only reliable `any` detector — `any` absorbs the impossible `0 extends 1`. */
export type IsAny<T> = 0 extends 1 & T ? true : false

// --- Assertion utils -------------------------------------------------------

export type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false

export type Expect<T extends true> = T
