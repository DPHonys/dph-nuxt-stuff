import { describe, expect, it } from 'vitest'
import type { Diagnostic } from './compile-harness'
import {
  compileFixture,
  fixturePath,
  FIXTURE_TSCONFIG,
  lineContaining,
  saying,
} from './compile-harness'

// What an author reads when they misdeclare an error or misuse the Fail
// helper. The guards' sentences are public surface, asserted verbatim and at
// the offending line; the Fail helper's pairing errors are TypeScript's own,
// asserted the same way so a signature change that degrades them fails here.

const FIXTURE = fixturePath('misuse-errors.ts')

const diagnostics = compileFixture(FIXTURE_TSCONFIG, FIXTURE)

/** TS2322 - a value that does not fit the type it was written against. */
const NOT_ASSIGNABLE = 2322

/** TS2345 - an argument that does not fit its parameter. */
const ARGUMENT_NOT_ASSIGNABLE = 2345

/** TS2375 - the `exactOptionalPropertyTypes` flavour of TS2322. */
const NOT_ASSIGNABLE_EXACT_OPTIONAL = 2375

/** TS2554 - a call with the wrong number of arguments. */
const WRONG_ARGUMENT_COUNT = 2554

const SENTENCES = {
  reservedValidation:
    'validation-failed is reserved for the built-in variant - rename the declared error',
  reservedRequest:
    'request-failed is reserved for the built-in variant - rename the declared error',
  emptyTag: 'an error tag must be a non-empty string',
  oneLiteral: 'an error tag must be one string literal',
  tagMismatch:
    "the schema's output has _tag order-missing, which must equal the tag order-not-found",
  objectFields: 'the schema must describe an object of fields beside _tag',
  strayKey:
    'payload is not an error entry key - an entry takes status and schema',
  numericKey: 'an error tag must be a string key - quote a numeric one',
} as const

/** The one diagnostic reported on the fixture line containing `needle`. */
function at(needle: string): Diagnostic | undefined {
  const line = lineContaining(FIXTURE, needle)
  const found = diagnostics.filter((diagnostic) => diagnostic.line === line)

  expect(found, `diagnostics on line ${line}`).toHaveLength(1)

  return found[0]
}

/** Whether a diagnostic carries the guard with `sentence`, byte for byte. */
function guarding(diagnostic: Diagnostic | undefined, sentence: string) {
  return diagnostic?.message.includes(`ErrorDeclarationError<"${sentence}">`)
}

describe('the error declaration diagnostics', () => {
  it('are the same run every time, and nothing more than this run', () => {
    // The count is pinned as well as each sentence, so a diagnostic that
    // appears, moves or vanishes fails here rather than passing quietly.
    expect(diagnostics).toHaveLength(18)
    expect(compileFixture(FIXTURE_TSCONFIG, FIXTURE)).toEqual(diagnostics)
  })

  it('never reports a stack-depth error', () => {
    // TS2321 and TS2589 would hide behind the guards' own errors otherwise.
    expect(
      diagnostics.filter(({ code }) => code === 2321 || code === 2589)
    ).toEqual([])
  })
})

describe('defineError refuses a tag at the tag', () => {
  it.each([
    ["defineError('validation-failed'", SENTENCES.reservedValidation],
    ["defineError('request-failed'", SENTENCES.reservedRequest],
    ["defineError('',", SENTENCES.emptyTag],
    ['defineError(someTag,', SENTENCES.oneLiteral],
    ['defineError(eitherTag,', SENTENCES.oneLiteral],
  ])('%s', (needle, sentence) => {
    const diagnostic = at(needle)

    expect(diagnostic?.code).toBe(ARGUMENT_NOT_ASSIGNABLE)
    expect(guarding(diagnostic, sentence)).toBe(true)
  })
})

describe('defineError refuses an entry its tag cannot carry', () => {
  it('refuses a schema whose _tag literal is not the tag, at the tag', () => {
    const diagnostic = at("defineError('order-not-found'")

    expect(diagnostic?.code).toBe(ARGUMENT_NOT_ASSIGNABLE)
    expect(guarding(diagnostic, SENTENCES.tagMismatch)).toBe(true)
  })

  it('refuses a schema whose output is not an object of fields', () => {
    const diagnostic = at("defineError('scalar-fields'")

    expect(diagnostic?.code).toBe(ARGUMENT_NOT_ASSIGNABLE)
    expect(guarding(diagnostic, SENTENCES.objectFields)).toBe(true)
  })

  it('refuses a key an entry does not take, at that key', () => {
    // The pre-rename `payload:` would otherwise silently mean "no schema".
    const diagnostic = at('payload: z.object({ id: z.number() }),')

    expect(diagnostic?.code).toBe(NOT_ASSIGNABLE_EXACT_OPTIONAL)
    expect(guarding(diagnostic, SENTENCES.strayKey)).toBe(true)
  })
})

describe("a route's errors map is refused at the key", () => {
  it('refuses a reserved tag', () => {
    const diagnostic = at("'validation-failed': { status: 400 }")

    expect(diagnostic?.code).toBe(NOT_ASSIGNABLE)
    expect(guarding(diagnostic, SENTENCES.reservedValidation)).toBe(true)
  })

  it('refuses a schema whose _tag literal is not the key', () => {
    const diagnostic = at(
      "'order-not-found': { status: 404, schema: missingOrder }"
    )

    expect(diagnostic?.code).toBe(NOT_ASSIGNABLE)
    expect(guarding(diagnostic, SENTENCES.tagMismatch)).toBe(true)
  })

  it('refuses a key an entry does not take', () => {
    const diagnostic = at("'stray-key': { status: 400, payload")

    expect(diagnostic?.code).toBe(NOT_ASSIGNABLE_EXACT_OPTIONAL)
    expect(guarding(diagnostic, SENTENCES.strayKey)).toBe(true)
  })

  it('refuses a numeric key, which names no tag the helper can reach', () => {
    const diagnostic = at('404: { status: 404 }')

    expect(diagnostic?.code).toBe(NOT_ASSIGNABLE)
    expect(guarding(diagnostic, SENTENCES.numericKey)).toBe(true)
  })

  it('carries every sentence it raises inside the one guard type', () => {
    for (const sentence of Object.values(SENTENCES)) {
      expect(saying(diagnostics, sentence).length).toBeGreaterThan(0)
    }
  })
})

describe('fail pairs a declared tag with its fields', () => {
  it('refuses a tag the route never declared, against the declared ones', () => {
    expect(at("fail('order-unknown')")).toMatchObject({
      code: ARGUMENT_NOT_ASSIGNABLE,
      message: `Argument of type '"order-unknown"' is not assignable to parameter of type '"order-locked" | "order-not-found"'.`,
    })
  })

  it('refuses a reserved tag, which no route can declare', () => {
    expect(at("fail('validation-failed')")).toMatchObject({
      code: ARGUMENT_NOT_ASSIGNABLE,
      message: `Argument of type '"validation-failed"' is not assignable to parameter of type '"order-locked" | "order-not-found"'.`,
    })
  })

  it('requires the fields of a tag declared with a schema', () => {
    expect(at("fail('order-not-found')")).toMatchObject({
      code: WRONG_ARGUMENT_COUNT,
      message: 'Expected 2 arguments, but got 1.',
    })
  })

  it('checks the fields against the schema output', () => {
    expect(at("fail('order-not-found', { id: 'seven' })")).toMatchObject({
      code: NOT_ASSIGNABLE,
      message: "Type 'string' is not assignable to type 'number'.",
    })
  })

  it('refuses fields for a tag declared without a schema', () => {
    expect(at("fail('order-locked', { id: 7 })")).toMatchObject({
      code: WRONG_ARGUMENT_COUNT,
      message: 'Expected 1 arguments, but got 2.',
    })
  })

  it('refuses a tag a Pick narrowed away, at the tag', () => {
    expect(at("failNarrowed('forbidden'")).toMatchObject({
      code: ARGUMENT_NOT_ASSIGNABLE,
      message: `Argument of type '"forbidden"' is not assignable to parameter of type '"unauthorized"'.`,
    })
  })
})
