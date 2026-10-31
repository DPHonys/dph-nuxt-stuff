import { describe, expect, it } from 'vitest'
import type { Diagnostic } from './compile-harness'
import {
  compileFixture,
  fixturePath,
  FIXTURE_TSCONFIG,
  lineContaining,
} from './compile-harness'

// What a `useBetterAsyncData` call site is told when its handler does not
// resolve to a `.try` result. These are TypeScript's own sentences, asserted
// verbatim and at the line they land on, so a change to the types that
// degrades them fails here.

const FIXTURE = fixturePath('misuse-composables.ts')

const diagnostics = compileFixture(FIXTURE_TSCONFIG, FIXTURE)

/** The refusal of a handler that forgot `.try`. */
const FORGOT_TRY =
  'AsyncDataHandlerError<"resolve to a .try result, such as $betterFetch.try(…)">'

/** The refusal of a handler resolving `any`. */
const RESOLVED_ANY =
  'AsyncDataHandlerError<"resolve to a typed .try result, such as $betterFetch.try(…), not any - an untyped result cannot be told from one that left out .try">'

/** The one diagnostic reported on the fixture line containing `needle`. */
function at(needle: string): Diagnostic | undefined {
  const line = lineContaining(FIXTURE, needle)
  const found = diagnostics.filter((diagnostic) => diagnostic.line === line)

  expect(found, `diagnostics on line ${line}`).toHaveLength(1)

  return found[0]
}

describe('the composables diagnostics', () => {
  it('are the same every run, and nothing more', () => {
    expect(diagnostics).toHaveLength(3)
    expect(compileFixture(FIXTURE_TSCONFIG, FIXTURE)).toEqual(diagnostics)
  })
})

describe('a useBetterAsyncData handler must resolve to a .try result', () => {
  it('refuses one resolving plain data, at what it resolves', () => {
    expect(at("useBetterAsyncData('plain'")).toEqual({
      code: 2769,
      message: [
        'No overload matches this call.',
        '  The last overload gave the following error.',
        `    Type 'Promise<{ id: number; }>' is not assignable to type 'Promise<{ id: number; } & ${FORGOT_TRY}>'.`,
        `      Type '{ id: number; }' is not assignable to type '{ id: number; } & ${FORGOT_TRY}'.`,
        `        Property ''async-data-handler-error'' is missing in type '{ id: number; }' but required in type '${FORGOT_TRY}'.`,
      ].join('\n'),
      line: lineContaining(FIXTURE, "useBetterAsyncData('plain'"),
      fileName: FIXTURE,
    })
  })

  it('refuses one resolving any, which would pass for a .try result', () => {
    expect(at("useBetterAsyncData('untyped'")).toEqual({
      code: 2769,
      message: [
        'No overload matches this call.',
        '  The last overload gave the following error.',
        "    Argument of type '() => Promise<any>' is not assignable to parameter of type 'CheckedHandler<any>'.",
        `      Type '() => Promise<any>' is not assignable to type '${RESOLVED_ANY}'.`,
      ].join('\n'),
      line: lineContaining(FIXTURE, "useBetterAsyncData('untyped'"),
      fileName: FIXTURE,
    })
  })

  it('refuses one resolving any in a keyless call too', () => {
    const refusal = at('useBetterAsyncData(() => untyped())')

    expect(refusal?.code).toBe(2769)
    expect(refusal?.message).toContain(
      `Type '() => Promise<any>' is not assignable to type '${RESOLVED_ANY}'.`
    )
  })
})
