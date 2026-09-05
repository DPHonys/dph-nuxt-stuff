import { describe, expect, it } from 'vitest'
import {
  compileFixture,
  fixturePath,
  FIXTURE_TSCONFIG,
  lineContaining,
  saying,
} from './compile-harness'

// What an author reads when they misuse a declaration. The umbrella's two
// sentences are public surface, asserted verbatim and at the offending line;
// the parents' guards are asserted to still fire through the umbrella.

const FIXTURE = fixturePath('misuse-declaration.ts')

const diagnostics = compileFixture(FIXTURE_TSCONFIG, FIXTURE)

/** TS2345 - an argument that does not fit its parameter. */
const ARGUMENT_NOT_ASSIGNABLE = 2345
const NO_OVERLOAD_MATCHES = 2769

/** The reserved-tag sentence, verbatim. */
const RESERVED_TAG = 'validation-failed is reserved for the built-in variant'

/** The bare-`{}` sentence, verbatim. */
const DECLARE_SOMETHING = 'declare validate, errors, or both'

describe('the declaration guards’ diagnostics', () => {
  it('is the same run every time, and nothing more than this run', () => {
    // The length is pinned as well as the sentences, so a diagnostic that
    // appears, moves or vanishes fails here rather than passing quietly.
    expect(diagnostics).toHaveLength(6)
    expect(compileFixture(FIXTURE_TSCONFIG, FIXTURE)).toEqual(diagnostics)
  })

  it('retains the actionable guard sentences inside overload diagnostics', () => {
    const overloads = diagnostics.filter(
      (diagnostic) => diagnostic.code === NO_OVERLOAD_MATCHES
    )
    expect(overloads).toHaveLength(4)
    for (const guard of [
      '__reservedErrorTag__',
      '__declareSomething__',
      'validation-declaration-error',
      '__divergentErrorTag__',
    ]) {
      expect(
        overloads.some((diagnostic) => diagnostic.message.includes(guard))
      ).toBe(true)
    }
    // After a rejected legacy declaration, TypeScript contextualizes its
    // callback from the first overload's impossible record context.
    const [context] = saying(diagnostics, 'This expression is not callable')
    expect(context?.code).toBe(2349)
    expect(context?.line).toBe(lineContaining(FIXTURE, "fail('forbidden')"))
  })

  it('refuses the reserved tag at the declaration that carries it', () => {
    const [reserved] = saying(diagnostics, RESERVED_TAG)

    expect(reserved?.code).toBe(NO_OVERLOAD_MATCHES)
    expect(reserved?.message).toContain('__reservedErrorTag__')
    expect(reserved?.line).toBe(
      lineContaining(FIXTURE, 'export const reservedTag')
    )
  })

  it('refuses a bare `{}` at the argument itself', () => {
    const [bare] = saying(diagnostics, DECLARE_SOMETHING)

    expect(bare?.code).toBe(NO_OVERLOAD_MATCHES)
    expect(bare?.message).toContain('__declareSomething__')
    expect(bare?.line).toBe(lineContaining(FIXTURE, '({}, () => null)'))
  })

  it('refuses `fail("validation-failed")` against the declared tags alone', () => {
    // The built-in variant is never in `fail`'s union, so the compiler's own
    // sentence names exactly the declared tags - no umbrella wording needed.
    const [reservedFail] = saying(
      diagnostics,
      `Argument of type '"validation-failed"' is not assignable to parameter of type '"user-not-found" | "forbidden"'`
    )

    expect(reservedFail?.code).toBe(ARGUMENT_NOT_ASSIGNABLE)
    expect(reservedFail?.line).toBe(
      lineContaining(FIXTURE, "fail('validation-failed')")
    )
  })

  it('still fires the validation parent’s stray-key sentence at the call', () => {
    const [stray] = saying(
      diagnostics,
      "'boyd' is not a validation source - the sources are routerParams, query, headers and body"
    )

    expect(stray?.code).toBe(NO_OVERLOAD_MATCHES)
    expect(stray?.line).toBe(lineContaining(FIXTURE, 'export const strayKey'))
  })

  it('still fires the errors parent’s divergent-tag guard at the declaration', () => {
    const [divergent] = saying(diagnostics, '__divergentErrorTag__')

    expect(divergent?.code).toBe(NO_OVERLOAD_MATCHES)
    expect(divergent?.line).toBe(
      lineContaining(FIXTURE, 'export const divergentTag')
    )
  })
})
