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

/**
 * What an author actually reads when they misuse a declaration - the recorded
 * deliberate-error run.
 *
 * The `Assert<Equal<…>>` suites next door prove a declaration is accepted and
 * inferred; they cannot prove a rejected one says anything useful. The three
 * sentences below are **public surface** - DESIGN.md's locked promise is that a
 * broken declaration is told what it did, at the key it did it - so each is
 * asserted verbatim and at the offending key's own line.
 *
 * The run's length is pinned as well as its sentences, so a diagnostic that
 * appears, moves or vanishes fails here rather than passing quietly - which is
 * what makes this a regression fixture rather than an anecdote.
 */

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
    expect(diagnostics).toHaveLength(8)
    expect(compileFixture(FIXTURE_TSCONFIG, FIXTURE)).toEqual(diagnostics)
  })

  it('never collapses into an overload paragraph', () => {
    // The whole reason the wrapper has one signature: v1's two overloads turned
    // every rejection into a "No overload matches this call" essay, with the
    // actionable sentence buried in one of its branches.
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
    // Both flavours of the rule - a primitive output and an array output - get
    // the same sentence, because the fix is the same either way.
    const [primitive, array] = saying(diagnostics, NON_OBJECT_OUTPUT)

    expect(primitive?.code).toBe(NOT_ASSIGNABLE)
    expect(primitive?.line).toBe(lineContaining(FIXTURE, 'body: [z.string(),'))

    expect(array?.code).toBe(NOT_ASSIGNABLE)
    expect(array?.line).toBe(
      lineContaining(FIXTURE, 'body: [z.array(z.string()),')
    )
  })

  it('rejects a value that is not a schema at all', () => {
    // No sentence of this package's own: the slot constraint already says the
    // whole of it, and inventing a message here would only bury it.
    const [notASchema] = saying(
      diagnostics,
      "Type 'number' is not assignable to type 'SourceSchemas'"
    )

    expect(notASchema?.code).toBe(NOT_ASSIGNABLE)
    expect(notASchema?.line).toBe(lineContaining(FIXTURE, 'query: 42'))
  })

  it('rejects a widened array at the tuple constraint', () => {
    // An array of unknown length cannot type its merge, so the constraint - not
    // a guard sentence - is what turns it away, naming the tuple it wanted.
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
  })

  it('makes an explicit response type argument an arity error', () => {
    // The sibling's no-default-`Response` rule, stated as a diagnostic: one
    // explicit type argument cannot silently collapse the success type to `any`.
    const [arity] = diagnostics.filter(
      (diagnostic) => diagnostic.code === WRONG_TYPE_ARGUMENT_COUNT
    )

    expect(arity?.message).toContain('Expected 2-3 type arguments, but got 1')
  })
})
