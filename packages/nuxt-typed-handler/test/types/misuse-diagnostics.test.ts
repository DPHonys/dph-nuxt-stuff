import { describe, expect, it } from 'vitest'
import {
  compileFixture,
  fixturePath,
  FIXTURE_TSCONFIG,
  lineContaining,
  NOT_ASSIGNABLE_EXACT_OPTIONAL,
  saying,
} from './compile-harness'

// What an author reads when they misuse a declaration. The umbrella's two
// sentences are public surface, asserted verbatim and at the offending line;
// the parents' guards are asserted to still fire through the umbrella.

const FIXTURE = fixturePath('misuse-declaration.ts')

const diagnostics = compileFixture(FIXTURE_TSCONFIG, FIXTURE)

/** TS2345 - an argument that does not fit its parameter. */
const ARGUMENT_NOT_ASSIGNABLE = 2345

/** The reserved-tag sentence, verbatim. */
const RESERVED_TAG = 'validation-failed is reserved for the built-in variant'

/** The bare-`{}` sentence, verbatim. */
const DECLARE_SOMETHING = 'declare validate, errors, or both'

describe('the declaration guards’ diagnostics', () => {
  it('is the same run every time, and nothing more than this run', () => {
    // The length is pinned as well as the sentences, so a diagnostic that
    // appears, moves or vanishes fails here rather than passing quietly.
    expect(diagnostics).toHaveLength(5)
    expect(compileFixture(FIXTURE_TSCONFIG, FIXTURE)).toEqual(diagnostics)
  })

  it('retains the actionable guard sentences with a single signature', () => {
    expect(diagnostics.some((diagnostic) => diagnostic.code === 2769)).toBe(
      false
    )
    for (const guard of [
      '__reservedErrorTag__',
      '__declareSomething__',
      'validation-declaration-error',
      '__divergentErrorTag__',
    ]) {
      expect(
        diagnostics.some((diagnostic) => diagnostic.message.includes(guard))
      ).toBe(true)
    }
  })

  it('refuses the reserved tag at the declaration that carries it', () => {
    const [reserved] = saying(diagnostics, RESERVED_TAG)

    expect(reserved?.code).toBe(ARGUMENT_NOT_ASSIGNABLE)
    expect(reserved?.message).toContain('__reservedErrorTag__')
    expect(reserved?.line).toBe(
      lineContaining(FIXTURE, '{ errors: [...userErrors, reserved] }')
    )
  })

  it('refuses a bare `{}` at the argument itself', () => {
    const [bare] = saying(diagnostics, DECLARE_SOMETHING)

    expect(bare?.code).toBe(ARGUMENT_NOT_ASSIGNABLE)
    expect(bare?.message).toContain('__declareSomething__')
    expect(bare?.line).toBe(lineContaining(FIXTURE, '({}, () => null)'))
  })

  it('refuses a factory for the built-in validation variant', () => {
    const [reservedFactory] = saying(
      diagnostics,
      "Property 'validation-failed' does not exist"
    )

    expect(reservedFactory?.code).toBe(7053)
    expect(reservedFactory?.line).toBe(
      lineContaining(FIXTURE, "throw errors['validation-failed']()")
    )
  })

  it('still fires the validation parent’s stray-key sentence at the call', () => {
    const [stray] = saying(
      diagnostics,
      "'boyd' is not a validation source - the sources are routerParams, query, headers and body"
    )

    expect(stray?.code).toBe(NOT_ASSIGNABLE_EXACT_OPTIONAL)
    expect(stray?.line).toBe(lineContaining(FIXTURE, '      boyd:'))
  })

  it('still fires the errors parent’s divergent-tag guard at the declaration', () => {
    const [divergent] = saying(diagnostics, '__divergentErrorTag__')

    expect(divergent?.code).toBe(ARGUMENT_NOT_ASSIGNABLE)
    expect(divergent?.line).toBe(
      lineContaining(FIXTURE, '{ errors: [...userErrors, ...conflicting] }')
    )
  })
})
