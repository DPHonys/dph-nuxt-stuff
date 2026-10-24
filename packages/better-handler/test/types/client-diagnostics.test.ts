import { describe, expect, it } from 'vitest'
import type { Diagnostic } from './compile-harness'
import {
  compileFixture,
  fixturePath,
  FIXTURE_TSCONFIG,
  lineContaining,
} from './compile-harness'

// What a call site is told when it does not handle every failure a route can
// produce. These are TypeScript's own sentences, asserted verbatim and at the
// line they land on, so a change to the types that degrades them fails here.

const FIXTURE = fixturePath('misuse-client.ts')

const diagnostics = compileFixture(FIXTURE_TSCONFIG, FIXTURE)

/** The union every case below matches over, as TypeScript prints it. */
const ARMS =
  'ErrorArms<{ _tag: "order-not-found"; id: number; } | { _tag: "order-locked"; } | RequestFailed>'

/** The one diagnostic reported on the fixture line containing `needle`. */
function at(needle: string): Diagnostic | undefined {
  const line = lineContaining(FIXTURE, needle)
  const found = diagnostics.filter((diagnostic) => diagnostic.line === line)

  expect(found, `diagnostics on line ${line}`).toHaveLength(1)

  return found[0]
}

/**
 * The diagnostics on the line the arms object opens on inside the fixture
 * function `name`: below its own line come `matchError(`, the error, the arms.
 */
function onArmsOf(name: string): readonly Diagnostic[] {
  const line = lineContaining(FIXTURE, `export function ${name}`) + 3

  return diagnostics.filter((diagnostic) => diagnostic.line === line)
}

describe('the client diagnostics', () => {
  it('are the same every run, and nothing more', () => {
    expect(diagnostics).toHaveLength(5)
    expect(compileFixture(FIXTURE_TSCONFIG, FIXTURE)).toEqual(diagnostics)
  })
})

describe('a try result is exhaustive on _tag', () => {
  it('leaves the variant a switch does not handle, so `never` refuses it', () => {
    expect(at('const unhandled: never = error')).toEqual({
      code: 2322,
      message: `Type '{ _tag: "order-locked"; }' is not assignable to type 'never'.`,
      line: lineContaining(FIXTURE, 'const unhandled: never = error'),
      fileName: FIXTURE,
    })
  })
})

describe('matchError needs an arm for every tag', () => {
  it('refuses arms missing a declared variant, naming it', () => {
    expect(onArmsOf('missingArm')).toEqual([
      {
        code: 2345,
        message: [
          `Argument of type '{ 'order-not-found': () => void; 'request-failed': () => void; }' is not assignable to parameter of type '${ARMS}'.`,
          `  Property '"order-locked"' is missing in type '{ 'order-not-found': () => void; 'request-failed': () => void; }' but required in type '${ARMS}'.`,
        ].join('\n'),
        line: expect.any(Number),
        fileName: FIXTURE,
      },
    ])
  })

  it('refuses arms missing the Request-failed variant', () => {
    expect(onArmsOf('missingRequestFailed')).toEqual([
      {
        code: 2345,
        message: [
          `Argument of type '{ 'order-not-found': () => void; 'order-locked': () => void; }' is not assignable to parameter of type '${ARMS}'.`,
          `  Property '"request-failed"' is missing in type '{ 'order-not-found': () => void; 'order-locked': () => void; }' but required in type '${ARMS}'.`,
        ].join('\n'),
        line: expect.any(Number),
        fileName: FIXTURE,
      },
    ])
  })

  it('refuses an arm for a tag the failure cannot carry, at that arm', () => {
    expect(at("'order-unknown': () => {},")).toMatchObject({
      code: 2353,
      message: `Object literal may only specify known properties, and ''order-unknown'' does not exist in type '${ARMS}'.`,
    })
  })

  it('requires the fallback for a tag no arm names', () => {
    expect(at('matchError(failure, {')).toMatchObject({
      code: 2554,
      message: 'Expected 3 arguments, but got 2.',
    })
  })
})
