/**
 * The type-assertion helpers the compiler-asserted suites share, ported from
 * the sandbox's `src/sandbox/assert.ts` rather than restated per file.
 *
 * `Equal` is the invariant-position trick, so it distinguishes `{ a: string }`
 * from `{ a: string } | { a: string }`-style widenings that a bare `extends`
 * pair would call equal.
 */

export type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false

export type Assert<T extends true> = T
