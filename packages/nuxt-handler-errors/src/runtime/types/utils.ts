/**
 * Type-level utilities with no domain of their own.
 *
 * `IsAny` is exported so `./catalogue` and `./handler` can share one copy, and
 * is deliberately **absent from `./index`'s re-exports**: every name the barrel
 * publishes is public API for good, and this one is an implementation detail of
 * two guards. `Flatten` is published, because it is what renders a variant flat
 * and a consumer writing a helper over one has reason to name it.
 */

/**
 * Whether `T` is `any`. Load-bearing in the two places that both fail
 * *silently* without it — see `SurvivesSerialization` and `ExtractErrorsSafe`.
 */
export type IsAny<T> = 0 extends 1 & T ? true : false

/**
 * A distributive identity mapped type that forces evaluation: it collapses a
 * variant's `{ tag; status } & P` intersection into the single object type a
 * hover renders. `T extends unknown` is the distributivity trigger, so a
 * union stays a union of flat members.
 */
export type Flatten<T> = T extends unknown ? { [K in keyof T]: T[K] } : never
