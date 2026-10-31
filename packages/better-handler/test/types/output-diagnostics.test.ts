import { describe, expect, it } from 'vitest'
import type { Diagnostic } from './compile-harness'
import {
  compileFixture,
  fixturePath,
  FIXTURE_TSCONFIG,
  lineContaining,
} from './compile-harness'

// What an author reads when a route's `output` is answered wrongly, reached
// for where none is offered, or declares nothing. The Respond helper's whole
// promise is a compile-time one, so every way of breaking it is read here,
// verbatim and at the line the author broke it on.

const FIXTURE = fixturePath('misuse-output.ts')

const diagnostics = compileFixture(FIXTURE_TSCONFIG, FIXTURE)

/** TS2322 - a value that does not fit the type it was written against. */
const NOT_ASSIGNABLE = 2322

/** TS2339 - a property the type does not have. */
const NO_SUCH_PROPERTY = 2339

/** TS2345 - an argument that does not fit its parameter. */
const ARGUMENT_NOT_ASSIGNABLE = 2345

/** TS2554 - a call with the wrong number of arguments. */
const WRONG_ARGUMENT_COUNT = 2554

/** The guard's sentence, verbatim. */
const DECLARE_SOMETHING = 'declare input, errors, output, or any combination'

/** The Respond helper's sentence for a status that is not one literal. */
const ONE_STATUS =
  'respond takes one status literal - respond under each status in its own branch'

/** The one diagnostic reported on the fixture line containing `needle`. */
function at(needle: string): Diagnostic | undefined {
  const line = lineContaining(FIXTURE, needle)
  const found = diagnostics.filter((diagnostic) => diagnostic.line === line)

  expect(found, `diagnostics on line ${line}`).toHaveLength(1)

  return found[0]
}

describe('the output diagnostics', () => {
  it('are the same run every time, and nothing more than this run', () => {
    expect(diagnostics).toHaveLength(15)
    expect(compileFixture(FIXTURE_TSCONFIG, FIXTURE)).toEqual(diagnostics)
  })

  it('never collapse into an overload paragraph', () => {
    // `respond` has one signature, its value on a rest tuple the status
    // picks, so a rejection names the one pairing it broke.
    for (const diagnostic of diagnostics) {
      expect(diagnostic.message).not.toContain('Overload')
    }
  })
})

describe('the Respond helper', () => {
  it('names the declared statuses when the Handler responds with another', () => {
    expect(at('respond(404,')).toEqual(
      expect.objectContaining({
        code: ARGUMENT_NOT_ASSIGNABLE,
        message:
          "Argument of type '404' is not assignable to parameter of type '200 | 201'.",
      })
    )
  })

  it('checks the value against the body of the status it is paired with', () => {
    // 200 would have accepted this value; 201 is what the Handler named.
    expect(at("respond(201, { id: '1' })")).toEqual(
      expect.objectContaining({
        code: ARGUMENT_NOT_ASSIGNABLE,
        message:
          "Argument of type '{ id: string; }' is not assignable to parameter of type '{ id: string; createdAt: string; }'.\n" +
          "  Property 'createdAt' is missing in type '{ id: string; }' but required in type '{ id: string; createdAt: string; }'.",
      })
    )
  })

  it('refuses a value for a status declared null', () => {
    // A bodiless status picks an empty rest tuple, so the value is one
    // argument too many.
    expect(at('respond(204,')).toEqual(
      expect.objectContaining({
        code: WRONG_ARGUMENT_COUNT,
        message: 'Expected 1 arguments, but got 2.',
      })
    )
  })

  it('requires the value for a status declaring a body', () => {
    expect(at('respond(200)')).toEqual(
      expect.objectContaining({
        code: WRONG_ARGUMENT_COUNT,
        message: 'Expected 2 arguments, but got 1.',
      })
    )
  })

  it('requires the value for a schema whose input is null', () => {
    // A `z.null()` slot sends a body, `null`; only a status declared `null`
    // is bodiless.
    expect(at('respond(201)')).toEqual(
      expect.objectContaining({
        code: WRONG_ARGUMENT_COUNT,
        message: 'Expected 2 arguments, but got 1.',
      })
    )
  })

  it.each([
    ['carrying a value', "respond(isNew ? 201 : 200, { id: '1' })"],
    ['of bodiless statuses', 'respond(isNew ? 204 : 205)'],
  ])('refuses a union status %s, at the status', (_, needle) => {
    // The value of a union would only have to fit one of its statuses'
    // bodies, so the union is refused whole and each branch responds alone.
    expect(at(needle)).toEqual(
      expect.objectContaining({
        code: ARGUMENT_NOT_ASSIGNABLE,
        message:
          `Argument of type 'number' is not assignable to parameter of type 'RespondError<"${ONE_STATUS}">'.\n` +
          `  Type 'number' is not assignable to type 'RespondError<"${ONE_STATUS}">'.`,
      })
    )
  })

  it('is the only way a map-form route answers', () => {
    // A bare value names no status, so the return is constrained to the
    // helper's result.
    expect(at("() => ({ id: '1' })")).toEqual(
      expect.objectContaining({
        code: NOT_ASSIGNABLE,
        message:
          "Type '{ id: string; }' is not assignable to type 'EventHandlerResponse<Responded<{ 200: { id: string; }; 201: { id: string; createdAt: string; }; }>>'.",
      })
    )
  })

  it('is the only way a single-status map answers, too', () => {
    expect(at("createdAt: '2026-10-25' })")).toEqual(
      expect.objectContaining({
        code: NOT_ASSIGNABLE,
        message:
          "Type '{ id: string; createdAt: string; }' is not assignable to type 'EventHandlerResponse<Responded<{ 201: { id: string; createdAt: string; }; }>>'.",
      })
    )
  })

  it('is absent from the context of a bare-form route', () => {
    expect(at("context.respond(200, { id: '1' })")).toEqual(
      expect.objectContaining({
        code: NO_SUCH_PROPERTY,
        message:
          "Property 'respond' does not exist on type 'HandlerContext<{}, {}, ZodObject<{ id: ZodString; }, $strip>>'.",
      })
    )
  })

  it('is absent from the context of a route declaring no output', () => {
    expect(at("context.respond(200, { id: '2' })")).toEqual(
      expect.objectContaining({
        code: NO_SUCH_PROPERTY,
        message:
          "Property 'respond' does not exist on type 'HandlerContext<{}, { readonly 'order-locked': { readonly status: 409; }; }, undefined>'.",
      })
    )
  })
})

describe('a bare-form route', () => {
  it('returns the schema’s output type, refused at the offending field', () => {
    expect(at('() => ({ id: 1 })')).toEqual(
      expect.objectContaining({
        code: NOT_ASSIGNABLE,
        message: "Type 'number' is not assignable to type 'string'.",
      })
    )
  })
})

describe('a bare-form route whose schema transforms', () => {
  it('returns the schema’s input, refusing the transform’s output', () => {
    // The development check validates exactly what the Handler returns, so
    // the type it must return is the one the check can pass.
    expect(at('at: new Date()')).toEqual(
      expect.objectContaining({
        code: NOT_ASSIGNABLE,
        message: "Type 'Date' is not assignable to type 'string'.",
      })
    )
  })
})

describe('a declaration that declares nothing', () => {
  it.each([
    ['an empty output', 'defineBetterEventHandler({ output: {} }'],
    [
      'an empty map for each of the three',
      '{ input: {}, errors: {}, output: {} },',
    ],
  ])('refuses %s at the options, in the guard’s sentence', (_, needle) => {
    const diagnostic = at(needle)

    expect(diagnostic?.code).toBe(ARGUMENT_NOT_ASSIGNABLE)
    expect(diagnostic?.message).toContain(
      `HandlerDeclarationError<"${DECLARE_SOMETHING}">`
    )
  })
})
