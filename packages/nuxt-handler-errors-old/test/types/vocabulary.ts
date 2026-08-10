/**
 * The type-level assertion vocabulary.
 *
 * Three rules bind every use of it, and every helper here exists so that the
 * correct form is the short one:
 *
 * 1. **Use `IsAny` explicitly** wherever *"must not be `any`"* is the real
 *    claim — written `Expect<Equal<IsAny<X>, false>>`. An `Equal<X, SomeType>`
 *    that passes is not proof, because the naive mutual-assignability helper
 *    passes with `X = any`.
 * 2. **Never write an unwrapped never-check.** Without the tuple wrap the check
 *    distributes over the empty union and is vacuously true, so `IsNever`
 *    tuple-wraps it once, here, and `assertNoBareNeverChecks` in `./harness.ts`
 *    fails the suite if anyone writes the unwrapped form by hand — including
 *    inside a comment, for the same reason prose must never quote an
 *    expect-error directive.
 * 3. **Positive fixtures assert ZERO diagnostics** — see `assertNoDiagnostics`
 *    in `./harness.ts`. Without that, a fixture which stops compiling for an
 *    unrelated reason passes while proving nothing.
 *
 * Assertions are written as throwaway type aliases, so they must be prefixed
 * with `_` to clear this repo's `unused-imports/no-unused-vars` rule:
 *
 * ```ts
 * type _errsExact = Expect<Equal<Errs, { tag: 'forbidden' }>>
 * ```
 */

/**
 * The conditional-identity equality check — the one helper `any` cannot fool.
 *
 * Mutual assignability (`X extends Y ? Y extends X ? true : false : false`)
 * reports `true` for `X = any` against literally anything. Deferring both sides
 * behind an unresolved type parameter compares the types as the checker
 * canonicalises them instead, so `Equal<any, string>` is `false`.
 */
export type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false

/**
 * Fails compilation unless `T` is exactly `true`.
 *
 * The constraint is what does the work: `Expect<false>` is a type error at the
 * declaration, so an assertion that stops holding stops compiling.
 */
export type Expect<T extends true> = T

/**
 * `true` when `T` is `any`, and *only* when `T` is `any`.
 *
 * `1 & T` collapses to `any` for `T = any`, and `0 extends any` is true; for
 * every other `T` the intersection stays narrow and `0` does not extend it.
 *
 * Rule 1's idiom is `Expect<Equal<IsAny<X>, false>>`. There is deliberately no
 * `NotAny` shorthand: the vocabulary is fixed at `Equal`, `Expect`
 * and `IsAny`, and the point of rule 1 is that `IsAny` appears where the claim
 * is made.
 */
export type IsAny<T> = 0 extends 1 & T ? true : false

/**
 * `true` when `T` is exactly `never`.
 *
 * The tuple wrap is rule 2 and it is not cosmetic. Written without it, the
 * conditional is distributive: applied to the empty union it has no members to
 * distribute over, so it short-circuits to `never` rather than to `false`, and
 * a check that was meant to reject `never` accepts it.
 */
export type IsNever<T> = [T] extends [never] ? true : false
