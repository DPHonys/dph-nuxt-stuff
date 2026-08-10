/**
 * The harness's positive self-test fixture. It must compile with **zero**
 * diagnostics, and it is asserted that way rather than
 * "no errors mentioning X", because a positive fixture that stops compiling for
 * an unrelated reason is the classic way a type-test suite goes green while
 * proving nothing.
 *
 * It doubles as the standing check that a fixture program is assembled from the
 * fixture *plus* the ambient world: `HarnessSelfTest` is declared in a file
 * nothing here imports.
 */

import type { Equal, Expect, IsAny, IsNever } from '../vocabulary'

declare const _ambient: HarnessSelfTest.AmbientProbe
declare const _tag: { readonly tag: 'forbidden'; readonly status: 403 }

/** Resolves only if `ambient/harness-self-test.d.ts` reached the program. */
type _ambientReached = Expect<
  Equal<(typeof _ambient)['reachedTheWholeProgram'], true>
>

/**
 * Rule 1: this is the claim `Equal` cannot make on its own. `Equal<X, T>`
 * passing is not proof that `X` is not `any`, so "must not be `any`" is written
 * with the helper that means exactly that.
 */
type _notCollapsed = Expect<Equal<IsAny<typeof _tag>, false>>

/** Rule 2: the never-check is tuple-wrapped, once, inside `IsNever`. */
type _pickDropped = Expect<IsNever<Extract<typeof _tag, { tag: 'ghost' }>>>

/**
 * The vocabulary asserting on itself, because everything downstream is only as
 * good as these four. `Equal`'s own body is a nest of conditionals inside a
 * function type, and a formatter reflowing its parentheses could silently
 * change what it means — so the discriminating cases are pinned here rather
 * than assumed.
 */
type _equalHolds = Expect<Equal<Equal<{ a: 1 }, { a: 1 }>, true>>
type _equalSeparates = Expect<Equal<Equal<{ a: 1 }, { a: 2 }>, false>>
type _equalIsNotFooledByAny = Expect<Equal<Equal<any, string>, false>>
type _equalKnowsAny = Expect<Equal<Equal<any, any>, true>>
type _isAnyHolds = Expect<Equal<IsAny<any>, true>>
type _isAnySeparatesUnknown = Expect<Equal<IsAny<unknown>, false>>
type _isNeverHolds = Expect<Equal<IsNever<never>, true>>
type _isNeverSeparatesUnion = Expect<Equal<IsNever<'a' | 'b'>, false>>
