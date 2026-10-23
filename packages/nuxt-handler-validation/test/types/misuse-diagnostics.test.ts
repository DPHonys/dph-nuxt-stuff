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
} from './compile-harness'

// What an author reads when they misuse a declaration. The three sentences
// below are public surface - a broken declaration is told what it did, at the
// key it did it - so each is asserted verbatim and at the offending key's line.

/** TS2353 - an object literal key the parameter type does not declare. */
const UNKNOWN_OPTION_KEY = 2353

/** TS2345 - an argument that does not fit its parameter. */
const ARGUMENT_NOT_ASSIGNABLE = 2345

const FIXTURE = fixturePath('misuse-declaration.ts')

const diagnostics = compileFixture(FIXTURE_TSCONFIG, FIXTURE)

/** The stray-key sentence, verbatim - one of the three locked messages. */
const STRAY_KEY =
  "'boyd' is not a validation source - the sources are route, query, headers and body"

/** The same sentence at the pre-rename name for the route source. */
const LEGACY_ROUTER_PARAMS_KEY =
  "'routerParams' is not a validation source - the sources are route, query, headers and body"

/** The overlap sentence, verbatim. */
const OVERLAPPING_KEYS =
  'schemas composed on one source must produce disjoint output keys - merge them in your schema library instead'

/** The "declare something" sentence, verbatim - the parent's own two halves. */
const DECLARE_SOMETHING = 'declare input, output, or both'

/** The object-output sentence, verbatim. */
const NON_OBJECT_OUTPUT =
  'every schema composed on one source must produce an object output - not a primitive, an array or a function'

describe('the declaration guard’s diagnostics', () => {
  it('is the same run every time, and nothing more than this run', () => {
    // The length is pinned as well as the sentences, so a diagnostic that
    // appears, moves or vanishes fails here rather than passing quietly.
    expect(diagnostics).toHaveLength(14)
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
      "Type 'number' is not assignable to type 'SourceSchemas | undefined'"
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
    // The second type argument is the Response output: `undefined` here, so
    // the context is the sources alone, with no `respond` beside them.
    const [undeclared, declared] = saying(
      diagnostics,
      "does not exist on type 'ValidatedContext<ValidationSchemas, undefined>'"
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

  it('refuses a declaration that declares nothing at all', () => {
    // Both halves are optional, so bare `{}` is what the guard is for: the
    // author is told the two halves they could have declared.
    const [bare] = saying(diagnostics, DECLARE_SOMETHING)

    expect(bare?.code).toBe(ARGUMENT_NOT_ASSIGNABLE)
    expect(bare?.message).toContain('__declareSomething__')
    expect(bare?.line).toBe(lineContaining(FIXTURE, '  {},'))
  })

  it('refuses an `output` that names no reply, in the same sentence', () => {
    // `{}` satisfies the status map's index signature vacuously, so without
    // the key check it would pass the guard and hand the handler a `respond`
    // whose status union is `never` - a route nobody could answer.
    const [, emptyMap] = saying(diagnostics, DECLARE_SOMETHING)

    expect(emptyMap?.code).toBe(ARGUMENT_NOT_ASSIGNABLE)
    expect(emptyMap?.message).toContain('__declareSomething__')
    expect(emptyMap?.line).toBe(lineContaining(FIXTURE, '{ output: {} },'))
  })

  it('refuses a return that is not the declared Response output', () => {
    // Nothing runs the declared schema, so the compiler is the whole of the
    // promise: the return is constrained to the schema's output type.
    const [wrongResponse] = saying(
      diagnostics,
      "Type 'number' is not assignable to type 'EventHandlerResponse<{ id: string; name: string; }>'"
    )

    expect(wrongResponse?.code).toBe(NOT_ASSIGNABLE)
    expect(wrongResponse?.line).toBe(lineContaining(FIXTURE, 'Number(42)'))
  })

  it('refuses the pre-rename `validate` key, with no alias behind it', () => {
    // The option key is `input` now, and the rename is a clean break: no
    // alias, no deprecation shim, just an unknown key on the options object.
    const [legacy] = saying(
      diagnostics,
      "Object literal may only specify known properties, and 'validate' does not exist in type 'ValidatedHandlerOptions<{}, undefined>'."
    )

    expect(legacy?.code).toBe(UNKNOWN_OPTION_KEY)
    expect(legacy?.line).toBe(
      lineContaining(FIXTURE, '{ validate: { query: pagination } }')
    )
  })

  it('refuses the pre-rename `routerParams` source, with no alias behind it', () => {
    // `route` is the name now, and the stray-key sentence lists the four
    // sources as they read today - the old name is not one of them.
    const [legacy] = saying(diagnostics, LEGACY_ROUTER_PARAMS_KEY)

    expect(legacy?.code).toBe(NOT_ASSIGNABLE_EXACT_OPTIONAL)
    expect(legacy?.line).toBe(lineContaining(FIXTURE, 'routerParams:'))
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

// What an author reads when a map-form Response output is answered wrongly.
// The Respond helper's whole promise is a compile-time one, so every way of
// breaking it is read here, at the line the author broke it on.

const RESPOND_FIXTURE = fixturePath('misuse-respond.ts')

const respondDiagnostics = compileFixture(FIXTURE_TSCONFIG, RESPOND_FIXTURE)

/** TS2554 - a call with the wrong number of arguments. */
const WRONG_ARGUMENT_COUNT = 2554

describe('the Respond helper’s diagnostics', () => {
  it('is the same run every time, and nothing more than this run', () => {
    // Six cases, six diagnostics: a rejection that appears, moves or vanishes
    // fails here rather than passing quietly.
    expect(respondDiagnostics).toHaveLength(6)
    expect(compileFixture(FIXTURE_TSCONFIG, RESPOND_FIXTURE)).toEqual(
      respondDiagnostics
    )
  })

  it('never collapses into an overload paragraph', () => {
    // `respond` has one signature for the same reason the wrapper does: two
    // would bury the actionable sentence in a branch of an essay.
    for (const diagnostic of respondDiagnostics) {
      expect(diagnostic.message).not.toContain('Overload')
    }
  })

  it('names the declared statuses when the handler responds with another', () => {
    const [undeclared] = saying(
      respondDiagnostics,
      "Argument of type '404' is not assignable to parameter of type '200 | 201'."
    )

    expect(undeclared?.code).toBe(ARGUMENT_NOT_ASSIGNABLE)
    expect(undeclared?.line).toBe(
      lineContaining(RESPOND_FIXTURE, 'respond(404,')
    )
  })

  it('checks the value against the schema of the status it was paired with', () => {
    // 200 would have accepted this value; 201 is what the handler named.
    const [mismatchedValue] = saying(
      respondDiagnostics,
      "Property 'createdAt' is missing in type '{ id: string; }'"
    )

    expect(mismatchedValue?.code).toBe(ARGUMENT_NOT_ASSIGNABLE)
    expect(mismatchedValue?.line).toBe(
      lineContaining(RESPOND_FIXTURE, 'respond(201,')
    )
  })

  it('refuses a plain return from a map-form route', () => {
    // A bare value names no status, so the map form has exactly one way to
    // answer - which is what the return constraint says.
    const [plain] = saying(
      respondDiagnostics,
      "Type '{ id: string; }' is not assignable to type 'EventHandlerResponse<Responded<{ 200: { id: string; }; 201: { id: string; createdAt: string; }; }>>'."
    )

    expect(plain?.code).toBe(NOT_ASSIGNABLE)
    expect(plain?.line).toBe(
      lineContaining(RESPOND_FIXTURE, '(_event, _validated) => ({ id: ')
    )
  })

  it('refuses a plain return from a single-key map too', () => {
    // One key is still a map: there is no plain-return shortcut for it.
    const [single] = saying(
      respondDiagnostics,
      "is not assignable to type 'EventHandlerResponse<Responded<{ 201: { id: string; createdAt: string; }; }>>'."
    )

    expect(single?.code).toBe(NOT_ASSIGNABLE)
    expect(single?.line).toBe(
      lineContaining(RESPOND_FIXTURE, "createdAt: '2026-09-09' }")
    )
  })

  it('refuses a value handed to a status declared `null`', () => {
    // The body rides a rest tuple the status picks, and a bodiless status
    // picks an empty one - so the second argument is one argument too many.
    const [bodiless] = saying(
      respondDiagnostics,
      'Expected 1 arguments, but got 2.'
    )

    expect(bodiless?.code).toBe(WRONG_ARGUMENT_COUNT)
    expect(bodiless?.line).toBe(lineContaining(RESPOND_FIXTURE, 'respond(204,'))
  })

  it('offers no `respond` at all on a bare-form route', () => {
    // The same missing-key diagnostic an undeclared source gets, because it
    // is the same rule: the context carries what the declaration guarantees.
    const [bare] = saying(
      respondDiagnostics,
      "Property 'respond' does not exist on type 'ValidatedContext<{}, ZodObject<{ id: ZodString; }, $strip>>'."
    )

    expect(bare?.code).toBe(PROPERTY_DOES_NOT_EXIST)
    expect(bare?.line).toBe(
      lineContaining(RESPOND_FIXTURE, 'validated.respond(200,')
    )
  })
})
