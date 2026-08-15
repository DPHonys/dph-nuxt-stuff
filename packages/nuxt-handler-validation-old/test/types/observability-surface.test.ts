import { describe, expect, it } from 'vitest'
import { recognizeValidationError } from '../../src/runtime/server'
import type { ValidationErrorData } from '../../src/runtime/types'

/**
 * The predicate's compile-time contract, asserted by the compiler under
 * `pnpm typecheck`. What it answers is asserted at the request seam; what is
 * here is the *shape* of the answer, which no runtime test can pin - a type
 * predicate would pass every one of them and still be the wrong export.
 */

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false

type Expect<T extends true> = T

/**
 * A value, not a type predicate - the sibling's `recognizeKnownError` shape, so
 * the two pair in one hook rather than fighting over the same narrowing.
 */
export type AnswersTheIssues = Expect<
  Equal<
    ReturnType<typeof recognizeValidationError>,
    ValidationErrorData | undefined
  >
>

/**
 * Nitro's hook contract is `(error: Error, context: CapturedErrorContext)`, so
 * the parameter has to take an `Error` as readily as an `unknown`. Exported and
 * never called: the `types` project runs its files as well as compiling them.
 */
export function inAnErrorHook(error: Error): ValidationErrorData | undefined {
  const issues = recognizeValidationError(error)

  if (issues === undefined) return undefined

  // Still an `Error` inside the branch, never narrowed to something of this
  // package's - which is what "a value, not a type predicate" buys the caller.
  type _e = Expect<Equal<typeof error, Error>>

  return issues
}

/** Keeps the file in vitest's inventory. */
describe('the observability predicate', () => {
  it('is asserted by the compiler', () => {
    expect(recognizeValidationError).toBeTypeOf('function')
  })
})
