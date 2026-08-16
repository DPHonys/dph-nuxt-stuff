/**
 * The type-assertion helpers the compiler-asserted suites share. `Equal` is the
 * invariant-position trick, so it distinguishes widenings a bare `extends` pair
 * would call equal.
 */

export type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false

export type Assert<T extends true> = T
