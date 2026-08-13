import { describe, expect, it } from 'vitest'
import {
  compileFixture,
  fixturePath,
  FIXTURE_TSCONFIG,
  NO_OVERLOAD_MATCHES,
  NOT_ASSIGNABLE,
  PROPERTY_DOES_NOT_EXIST,
  saying,
} from './compile-harness'

/**
 * What an author actually reads when they misuse a declaration - the recorded
 * deliberate-error runs, one per form.
 *
 * The assertions in `source-key-guard.test.ts` prove a call is rejected; a
 * rejection nobody can act on is still a bad surface, and only a compiler run
 * says which sentence reaches the author. Each fixture's diagnostic count is
 * pinned as well as its sentences, so a diagnostic that appears, moves or
 * vanishes fails here rather than passing quietly - which is what makes these
 * regression fixtures rather than anecdotes.
 *
 * **Both forms collapse.** The prototype recorded the flat form failing at the
 * offending property (`error-output.txt`), but it probed a signature with the
 * flat overload alone; the shipped wrapper has two, so a flat misuse is wrapped
 * in "No overload matches this call" exactly as an array one is. What matters
 * is that the actionable sentence survives inside an overload's explanation,
 * and that is asserted per form below.
 */

const FLAT_FIXTURE = fixturePath('misuse-flat-form.ts')
const ARRAY_FIXTURE = fixturePath('misuse-array-form.ts')

const flatDiagnostics = compileFixture(FIXTURE_TSCONFIG, FLAT_FIXTURE)
const arrayDiagnostics = compileFixture(FIXTURE_TSCONFIG, ARRAY_FIXTURE)

/** The stray schema's rejection, as the guard states it: a slot typed `never`. */
const STRAY_KEY = "is not assignable to type 'never'"

/** The hint that makes a typo actionable rather than merely rejected. */
const DID_YOU_MEAN = "Did you mean to write 'query'?"

/** `NotAGroup`'s accepted cost, in the words TypeScript prints it. */
const LENGTH_LINE = "Types of property 'length' are incompatible."

/**
 * One overload's own paragraph of an overload-failure diagnostic. Asserting
 * against the whole message would let a sentence count as surviving while
 * sitting under the overload the author never meant.
 */
function explanationOf(message: string, overload: 1 | 2): string {
  const second = message.indexOf('Overload 2 of 2')

  return overload === 1
    ? message.slice(message.indexOf('Overload 1 of 2'), second)
    : message.slice(second)
}

describe('the flat form’s misuse diagnostics', () => {
  it('is the same run every time, and nothing more than this run', () => {
    expect(flatDiagnostics).toHaveLength(6)
    expect(compileFixture(FIXTURE_TSCONFIG, FLAT_FIXTURE)).toEqual(
      flatDiagnostics
    )
  })

  it('suggests the source key an author meant to write', () => {
    const [typo] = saying(flatDiagnostics, DID_YOU_MEAN)

    // Under the flat overload's own explanation - the second, since the array
    // one is declared first - rather than merely somewhere in the message.
    expect(typo?.code).toBe(NO_OVERLOAD_MATCHES)
    expect(explanationOf(typo?.message ?? '', 2)).toContain(DID_YOU_MEAN)
  })

  it('rejects a stray key sitting beside a valid one', () => {
    // The case that used to compile clean, with that source silently never
    // validated. Named as the guard sees it - a schema in a slot typed `never`
    // - with the offending property visible in the parameter type.
    const [beside] = saying(flatDiagnostics, 'boyd')

    expect(beside?.code).toBe(NO_OVERLOAD_MATCHES)
    expect(explanationOf(beside?.message ?? '', 2)).toContain(STRAY_KEY)
  })

  it('rejects a hand-written name marker as the stray key it is', () => {
    const [forged] = saying(flatDiagnostics, '__validationName')

    expect(explanationOf(forged?.message ?? '', 2)).toContain(STRAY_KEY)
  })

  it('reports both definer arities at the offending key, uncollapsed', () => {
    // `defineValidation` has only arity overloads, so there is nothing to
    // collapse: the diagnostic is the bare assignment failure at the key, in
    // the file that declares the set rather than at every route using it.
    const atTheKey = flatDiagnostics.filter(
      (diagnostic) =>
        diagnostic.code === NOT_ASSIGNABLE &&
        diagnostic.message.includes(STRAY_KEY) &&
        !diagnostic.message.includes('Overload')
    )

    expect(atTheKey).toHaveLength(2)
  })

  it('names the missing key when a handler reads an undeclared source', () => {
    // Does not collapse: no overload is involved, so the author is told which
    // key is missing and what the context really holds.
    const [undeclared] = saying(
      flatDiagnostics,
      "Property 'body' does not exist"
    )

    expect(undeclared?.code).toBe(PROPERTY_DOES_NOT_EXIST)
    expect(undeclared?.message).toContain('ValidatedContext<')
  })
})

describe('the array form’s misuse diagnostics', () => {
  it('is the same run every time, and nothing more than this run', () => {
    expect(arrayDiagnostics).toHaveLength(5)
    expect(compileFixture(FIXTURE_TSCONFIG, ARRAY_FIXTURE)).toEqual(
      arrayDiagnostics
    )
  })

  it('keeps the actionable sentence inside the first overload’s explanation', () => {
    // The feared collapse is real but shallow: the hint an author acts on
    // survives, nested under the overload they actually meant.
    const [typo] = saying(arrayDiagnostics, DID_YOU_MEAN)

    expect(typo?.code).toBe(NO_OVERLOAD_MATCHES)
    expect(explanationOf(typo?.message ?? '', 1)).toContain(DID_YOU_MEAN)
  })

  it('rejects a stray key sitting beside a valid one', () => {
    const [beside] = saying(arrayDiagnostics, 'boyd')

    // In the array overload's paragraph specifically: the flat one's `length`
    // complaint below carries the same "not assignable to `never`" wording, so
    // reading the whole message would let the tax pass for the guard.
    expect(beside?.code).toBe(NO_OVERLOAD_MATCHES)
    expect(explanationOf(beside?.message ?? '', 1)).toContain(STRAY_KEY)
  })

  it('rejects an object-spread of groups', () => {
    // The spread keeps `length` in its type - a literal `1` here, two
    // one-element groups spread into one object - which is exactly what the
    // mapped array parameter refuses.
    const [spread] = saying(arrayDiagnostics, "Type '1' is not assignable")

    expect(spread?.code).toBe(NO_OVERLOAD_MATCHES)
    expect(explanationOf(spread?.message ?? '', 1)).toContain(LENGTH_LINE)
  })

  it('pays the accepted cost of `NotAGroup` on every failure', () => {
    // Worth stating rather than being surprised by: the flat overload's witness
    // means every array-form failure carries an irrelevant `length` paragraph.
    // The tax for a malformed group never being silently accepted.
    const collapsed = arrayDiagnostics.filter(
      (diagnostic) => diagnostic.code === NO_OVERLOAD_MATCHES
    )

    expect(collapsed).not.toEqual([])

    for (const diagnostic of collapsed) {
      expect(explanationOf(diagnostic.message, 2)).toContain(LENGTH_LINE)
    }
  })

  it('names the missing key when a handler reads an undeclared source', () => {
    const [undeclared] = saying(
      arrayDiagnostics,
      "Property 'body' does not exist"
    )

    expect(undeclared?.code).toBe(PROPERTY_DOES_NOT_EXIST)
    expect(undeclared?.message).toContain('MergedContext<')
  })

  it('prints the poison’s own sentence when a poisoned source is consumed', () => {
    // Does not collapse either, so the author learns what they did rather than
    // that something does not exist.
    const [poisoned] = saying(
      arrayDiagnostics,
      "Property 'page' does not exist"
    )

    expect(poisoned?.code).toBe(PROPERTY_DOES_NOT_EXIST)
    expect(poisoned?.message).toContain(
      'CompositionError<"two different sets share one name on this source">'
    )
  })
})
