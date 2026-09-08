import { describe, expect, it } from 'vitest'
import {
  compileFixture,
  fixturePath,
  FIXTURE_TSCONFIG,
  lineContaining,
  NOT_ASSIGNABLE,
  NOT_ASSIGNABLE_EXACT_OPTIONAL,
  PROPERTY_DOES_NOT_EXIST,
  saying,
  WRONG_TYPE_ARGUMENT_COUNT,
} from './compile-harness'

// What an author reads when they misuse a declaration. The three sentences
// below are public surface - a broken declaration is told what it did, at the
// key it did it - so each is asserted verbatim and at the offending key's line.

/** TS2353 - an object literal key the parameter type does not declare. */
const UNKNOWN_OPTION_KEY = 2353

const FIXTURE = fixturePath('misuse-declaration.ts')

const diagnostics = compileFixture(FIXTURE_TSCONFIG, FIXTURE)

/** The stray-key sentence, verbatim - one of the three locked messages. */
const STRAY_KEY =
  "'boyd' is not a validation source - the sources are routerParams, query, headers and body"

/** The overlap sentence, verbatim. */
const OVERLAPPING_KEYS =
  'schemas composed on one source must produce disjoint output keys - merge them in your schema library instead'

/** The object-output sentence, verbatim. */
const NON_OBJECT_OUTPUT =
  'every schema composed on one source must produce an object output - not a primitive, an array or a function'

describe('the declaration guard’s diagnostics', () => {
  it('is the same run every time, and nothing more than this run', () => {
    // The length is pinned as well as the sentences, so a diagnostic that
    // appears, moves or vanishes fails here rather than passing quietly.
    expect(diagnostics).toHaveLength(11)
    expect(compileFixture(FIXTURE_TSCONFIG, FIXTURE)).toEqual(diagnostics)
  })

  it('never collapses into an overload paragraph', () => {
    // The whole reason the wrapper has one signature: two overloads turn every
    // rejection into an essay with the actionable sentence buried in a branch.
    for (const diagnostic of diagnostics) {
      expect(diagnostic.message).not.toContain('Overload')
    }
  })

  it('names the four sources at the stray key itself', () => {
    const [stray] = saying(diagnostics, STRAY_KEY)

    expect(stray?.code).toBe(NOT_ASSIGNABLE_EXACT_OPTIONAL)
    expect(stray?.line).toBe(lineContaining(FIXTURE, 'boyd:'))
  })

  it('refuses overlapping outputs at the source key that composed them', () => {
    const [overlap] = saying(diagnostics, OVERLAPPING_KEYS)

    expect(overlap?.code).toBe(NOT_ASSIGNABLE)
    expect(overlap?.line).toBe(
      lineContaining(FIXTURE, 'query: [pagination, paginationTwin]')
    )
  })

  it('refuses a non-object output at the source key that composed it', () => {
    // A primitive output and an array output get the same sentence, because the
    // fix is the same either way.
    const [primitive, array] = saying(diagnostics, NON_OBJECT_OUTPUT)

    expect(primitive?.code).toBe(NOT_ASSIGNABLE)
    expect(primitive?.line).toBe(lineContaining(FIXTURE, 'body: [z.string(),'))

    expect(array?.code).toBe(NOT_ASSIGNABLE)
    expect(array?.line).toBe(
      lineContaining(FIXTURE, 'body: [z.array(z.string()),')
    )
  })

  it('rejects a value that is not a schema at all', () => {
    // No sentence of this package's own: the slot constraint already says it.
    const [notASchema] = saying(
      diagnostics,
      "Type 'number' is not assignable to type 'SourceSchemas'"
    )

    expect(notASchema?.code).toBe(NOT_ASSIGNABLE)
    expect(notASchema?.line).toBe(lineContaining(FIXTURE, 'query: 42'))
  })

  it('rejects a widened array at the tuple constraint', () => {
    // An array of unknown length cannot type its merge, so the constraint - not
    // a guard sentence - is what turns it away.
    const [widened] = saying(
      diagnostics,
      'Source provides no match for required element at position 0 in target'
    )

    expect(widened?.code).toBe(NOT_ASSIGNABLE)
    expect(widened?.line).toBe(lineContaining(FIXTURE, 'query: widened'))
  })

  it('names the missing key when a handler reads an undeclared source', () => {
    const [undeclared] = saying(diagnostics, "Property 'body' does not exist")

    expect(undeclared?.code).toBe(PROPERTY_DOES_NOT_EXIST)
    expect(undeclared?.message).toContain('ValidatedContext<')
    expect(undeclared?.line).toBe(lineContaining(FIXTURE, '=> validated.body'))
  })

  it('delivers no source at all from a declaration annotated with the public type', () => {
    // Annotating widens `keyof S` to the interface's four optional keys, so
    // `validated.body` used to compile as `unknown` and arrive `undefined`. A
    // slot that can be `undefined` is now no key at all - which costs the
    // annotated `query` too, and deliberately.
    const [undeclared, declared] = saying(
      diagnostics,
      "does not exist on type 'ValidatedContext<ValidationSchemas>'"
    )

    expect(undeclared?.code).toBe(PROPERTY_DOES_NOT_EXIST)
    expect(undeclared?.message).toContain("Property 'body'")
    expect(undeclared?.line).toBe(
      lineContaining(FIXTURE, 'undeclared: validated.body')
    )

    expect(declared?.code).toBe(PROPERTY_DOES_NOT_EXIST)
    expect(declared?.message).toContain("Property 'query'")
    expect(declared?.line).toBe(
      lineContaining(FIXTURE, 'declared: validated.query')
    )
  })

  it('makes an explicit response type argument an arity error', () => {
    // `Response` has no default, so one explicit type argument cannot silently
    // collapse the success type to `any`.
    const [arity] = diagnostics.filter(
      (diagnostic) => diagnostic.code === WRONG_TYPE_ARGUMENT_COUNT
    )

    expect(arity?.message).toContain('Expected 2-3 type arguments, but got 1')
  })

  it('refuses the pre-rename `validate` key, with no alias behind it', () => {
    // The option key is `input` now, and the rename is a clean break: no
    // alias, no deprecation shim, just an unknown key on the options object.
    const [legacy] = saying(
      diagnostics,
      "Object literal may only specify known properties, and 'validate' does not exist in type '{ input: ValidationSchemas & ValidationSchemasGuard<ValidationSchemas>; }'."
    )

    expect(legacy?.code).toBe(UNKNOWN_OPTION_KEY)
    expect(legacy?.line).toBe(
      lineContaining(FIXTURE, '{ validate: { query: pagination } }')
    )
  })

  it('fires the same sentence at the same key on a handler read back through the brand', () => {
    // The wrapper returns `ValidatedEventHandler<…, RequestInput<S>>`, but the
    // guard intersects the parameter, not the return, so a broken declaration
    // is still told what it did at the key it did it - and nothing else is
    // reported, not even at the brand read.
    const fixture = fixturePath('misuse-branded.ts')
    const branded = compileFixture(FIXTURE_TSCONFIG, fixture)

    expect(branded).toHaveLength(1)

    const [stray] = saying(branded, STRAY_KEY)

    expect(stray?.code).toBe(NOT_ASSIGNABLE_EXACT_OPTIONAL)
    expect(stray?.line).toBe(lineContaining(fixture, 'boyd:'))
  })
})
