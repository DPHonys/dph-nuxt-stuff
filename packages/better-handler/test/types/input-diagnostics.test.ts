import { describe, expect, it } from 'vitest'
import type { Diagnostic } from './compile-harness'
import {
  compileFixture,
  fixturePath,
  FIXTURE_TSCONFIG,
  lineContaining,
} from './compile-harness'

// What an author reads when they misdeclare a route's `input`, declare
// nothing at all, or reach past the Handler context. The guards' sentences
// are public surface, asserted verbatim and at the offending line; the rest
// are TypeScript's own, asserted the same way so a signature change that
// degrades them fails here.

const FIXTURE = fixturePath('misuse-input.ts')

const diagnostics = compileFixture(FIXTURE_TSCONFIG, FIXTURE)

/** TS2322 - a value that does not fit the type it was written against. */
const NOT_ASSIGNABLE = 2322

/** TS2339 - a property the type does not have. */
const NO_SUCH_PROPERTY = 2339

/** TS2345 - an argument that does not fit its parameter. */
const ARGUMENT_NOT_ASSIGNABLE = 2345

/** TS2353 - an object literal naming a property its type does not know. */
const EXCESS_PROPERTY = 2353

const SENTENCES = {
  misspelled:
    'quary is not a validation source - the sources are route, query, headers and body',
  overlapping:
    'schemas composed on one source must produce disjoint output keys - merge them in your schema library instead',
  primitive:
    'every schema composed on one source must produce an object output - not a primitive, an array or a function',
  declareSomething: 'declare input, errors, output, or any combination',
} as const

/** The one diagnostic reported on the fixture line containing `needle`. */
function at(needle: string): Diagnostic | undefined {
  const line = lineContaining(FIXTURE, needle)
  const found = diagnostics.filter((diagnostic) => diagnostic.line === line)

  expect(found, `diagnostics on line ${line}`).toHaveLength(1)

  return found[0]
}

describe('the input diagnostics', () => {
  it('are the same run every time, and nothing more than this run', () => {
    expect(diagnostics).toHaveLength(9)
    expect(compileFixture(FIXTURE_TSCONFIG, FIXTURE)).toEqual(diagnostics)
  })

  it('never report a stack-depth error', () => {
    expect(
      diagnostics.filter(({ code }) => code === 2321 || code === 2589)
    ).toEqual([])
  })
})

describe('a key under input that names no source', () => {
  it('is refused at the key, beside a real source, with the guard’s sentence', () => {
    const diagnostic = at('quary: sorting,')

    expect(diagnostic?.code).toBe(NOT_ASSIGNABLE)
    expect(diagnostic?.message).toContain(
      `InputDeclarationError<"${SENTENCES.misspelled}">`
    )
  })

  it('is refused at the key when it stands alone, as a property input never has', () => {
    // Alone, the declaration shares no key with the interface, so nothing is
    // inferred for the guard to read; TypeScript's own excess-property check
    // refuses it at the same key instead.
    expect(at('routerParams: pagination,')).toMatchObject({
      code: EXCESS_PROPERTY,
      message:
        "Object literal may only specify known properties, and 'routerParams' does not exist in type 'InputDeclaration & InputGuard<InputDeclaration>'.",
    })
  })
})

describe('a composed slot', () => {
  it('is refused when two elements produce the same output key', () => {
    const diagnostic = at('query: [pagination, paging],')

    expect(diagnostic?.code).toBe(NOT_ASSIGNABLE)
    expect(diagnostic?.message).toContain(
      `InputDeclarationError<"${SENTENCES.overlapping}">`
    )
  })

  it('is refused when an element produces no object', () => {
    const diagnostic = at('body: [pagination, z.string()],')

    expect(diagnostic?.code).toBe(NOT_ASSIGNABLE)
    expect(diagnostic?.message).toContain(
      `InputDeclarationError<"${SENTENCES.primitive}">`
    )
  })
})

describe('a declaration that declares nothing', () => {
  it.each([
    ['bare options', 'defineBetterEventHandler({}, () => null)'],
    ['an empty input', 'defineBetterEventHandler({ input: {} }'],
  ])('refuses %s at the options', (_, needle) => {
    const diagnostic = at(needle)

    expect(diagnostic?.code).toBe(ARGUMENT_NOT_ASSIGNABLE)
    expect(diagnostic?.message).toContain(
      `HandlerDeclarationError<"${SENTENCES.declareSomething}">`
    )
  })
})

describe('the Handler context', () => {
  it('has no key for a source the route does not declare', () => {
    expect(at('context.body')).toMatchObject({
      code: NO_SUCH_PROPERTY,
      message: expect.stringMatching(
        /^Property 'body' does not exist on type 'HandlerContext</
      ),
    })
  })

  it('has no Fail helper on a route declaring no errors', () => {
    expect(at('context.fail')).toMatchObject({
      code: NO_SUCH_PROPERTY,
      message: expect.stringMatching(
        /^Property 'fail' does not exist on type 'HandlerContext</
      ),
    })
  })

  it('cannot raise the Built-in validation-failed variant through fail', () => {
    expect(at("fail('validation-failed')")).toMatchObject({
      code: ARGUMENT_NOT_ASSIGNABLE,
      message: `Argument of type '"validation-failed"' is not assignable to parameter of type '"order-locked"'.`,
    })
  })
})
