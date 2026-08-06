import { globSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import {
  assertDiagnostic,
  assertHoverBudget,
  assertNoBareNeverChecks,
  assertNoDiagnostics,
  createTypeHarness,
  findBareNeverChecks,
} from './harness'

/**
 * The harness's self-test.
 *
 * A type-test suite can be green while proving nothing at all, and this one is
 * what every assertion in tickets 04–13 rests on — so each check here is paired
 * with its own failure direction. A harness that cannot fail is worthless.
 */

const TYPE_SUITE = fileURLToPath(new URL('.', import.meta.url))

/** The published runtime surface, scanned by the same never-check rule. */
const RUNTIME_SOURCE = fileURLToPath(
  new URL('../../src/runtime/', import.meta.url)
)

/**
 * One budget for two structurally unrelated declarations, so the self-test
 * proves the budget can fail as well as pass.
 *
 * measured 52 concise / 320 verbose — set at ~1.5× the good value.
 */
const SELF_TEST_BUDGET = 78

describe('the compile-time assertion harness', () => {
  const harness = createTypeHarness({ ts })

  describe('compiling one fixture alone', () => {
    it('reports a real diagnostic by code and message substring', () => {
      const compilation = harness.compileAlone('neg/harness-undeclared-tag.ts')

      const diagnostic = assertDiagnostic(compilation, {
        code: 2345,
        message: '"unauthorized" | "user-not-found"',
      })

      expect(diagnostic.fileName).toBe(compilation.fixture)
      expect(diagnostic.line).toBe(14)
    })

    it('fails when the code matches but the message does not', () => {
      const compilation = harness.compileAlone('neg/harness-undeclared-tag.ts')

      expect(() =>
        assertDiagnostic(compilation, { code: 2345, message: 'mfa-required' })
      ).toThrow(/Expected TS2345/)
    })

    it('fails when the message matches but the code does not', () => {
      const compilation = harness.compileAlone('neg/harness-undeclared-tag.ts')

      expect(() =>
        assertDiagnostic(compilation, {
          code: 2322,
          message: '"unauthorized" | "user-not-found"',
        })
      ).toThrow(/Expected TS2322/)
    })

    it('shows `Expect` biting on a claim that does not hold', () => {
      const compilation = harness.compileAlone(
        'neg/harness-failing-assertion.ts'
      )

      assertDiagnostic(compilation, {
        code: 2344,
        message: `Type 'false' does not satisfy the constraint 'true'`,
      })
    })

    it('never lets one fixture mask another in the same directory', () => {
      const first = harness.compileAlone('neg/harness-undeclared-tag.ts')
      const second = harness.compileAlone('neg/harness-isolation.ts')

      assertDiagnostic(first, { code: 2345, message: 'not assignable' })
      assertDiagnostic(second, { code: 2322, message: 'not assignable' })

      expect(first.diagnostics.map((d) => d.code)).toEqual([2345])
      expect(second.diagnostics.map((d) => d.code)).toEqual([2322])
      expect(new Set(first.diagnostics.map((d) => d.fileName))).toEqual(
        new Set([first.fixture])
      )
    })
  })

  describe('positive fixtures', () => {
    it('assert zero diagnostics, which is also what proves the program was assembled whole', () => {
      assertNoDiagnostics(harness.compileAlone('pos/harness-clean.ts'))
      assertNoDiagnostics(harness.compileAlone('pos/harness-hover.ts'))
    })

    it('are seeded with the ambient declarations nothing imports', () => {
      const compilation = harness.compileAlone('pos/harness-clean.ts')

      expect(compilation.rootNames[0]).toBe(compilation.fixture)
      expect(compilation.rootNames).toContain(
        fileURLToPath(
          new URL('./ambient/harness-self-test.d.ts', import.meta.url)
        )
      )
    })

    it('fail loudly when a fixture stops compiling clean', () => {
      expect(() =>
        assertNoDiagnostics(harness.compileAlone('neg/harness-isolation.ts'))
      ).toThrow(/Expected .* to compile clean/)
    })
  })

  describe('the hover renderer', () => {
    const compilation = harness.compileAlone('pos/harness-hover.ts')

    it('renders what an editor shows, with truncation disabled', () => {
      const verbose = compilation.renderHover('_hoverVerbose')

      // Measured: the same type rendered *without* `NoTruncation` is cut and
      // ends `boolean; }...`. The marker is the proof — the compiler's
      // truncation point sits a few characters short of this type's 320.
      expect(verbose).not.toContain('...')
      expect(verbose.length).toBeGreaterThan(300)
      expect(verbose).toContain('readonly traceId: string')

      // Stock double-quotes string literals in rendered types and in
      // diagnostic messages alike (harness header, behaviour 2) — asserted
      // here byte-for-byte so a quote-style change in a compiler bump is
      // caught where it lives.
      expect(compilation.renderHover('_hoverConcise')).toBe(
        `{ readonly tag: "forbidden"; readonly status: 403; }`
      )
    })

    it('resolves through the whole program, not the file under inspection', () => {
      expect(compilation.renderHover('_hoverAmbient')).toBe(
        '{ readonly reachedTheWholeProgram: true; }'
      )
    })

    it('refuses to report a type that came back collapsed', () => {
      expect(() => compilation.renderHover('_hoverCollapsed')).toThrow(
        /rendered as `any`/
      )
    })

    it('refuses the whole trap: the same fixture, starved of its program', () => {
      // The starved-program trap, reproduced rather than described. This harness
      // is given a config that reaches nothing but the file under inspection,
      // which is exactly what the first attempt at a hover renderer did.
      //
      // Measured, and the reason the guard is not simply "did it come back
      // `any`": `_hoverAmbient` renders as
      // `{ [x: string]: HarnessSelfTest.AmbientProbe; }` here — 45 plausible
      // characters that would have sailed through a length budget.
      const starved = createTypeHarness({
        ts,
        tsconfigPath: 'tsconfig.starved-program.json',
      })
      const alone = starved.compileAlone('pos/harness-hover.ts')

      expect(alone.rootNames).toEqual([alone.fixture])
      expect(alone.diagnostics.map((d) => d.code)).toEqual([2503, 2503])
      expect(() => alone.renderHover('_hoverAmbient')).toThrow(
        /did not compile clean/
      )
      expect(() =>
        assertHoverBudget(alone, { name: '_hoverConcise', max: 1000 })
      ).toThrow(/did not compile clean/)
    })

    it('names the target when there is no such declaration', () => {
      expect(() => compilation.renderHover('_nope')).toThrow(
        /No top-level `const` or `type` named `_nope`/
      )
    })

    it('holds a legible type to its budget', () => {
      // The budget measures length, not the exact string — cosmetic churn
      // moves a length a few percent, a real regression moves it 2–20×.
      const rendered = assertHoverBudget(compilation, {
        name: '_hoverConcise',
        max: SELF_TEST_BUDGET,
      })

      expect(rendered.length).toBeLessThanOrEqual(SELF_TEST_BUDGET)
    })

    it('blows the same budget on a verbose one', () => {
      expect(() =>
        assertHoverBudget(compilation, {
          name: '_hoverVerbose',
          max: SELF_TEST_BUDGET,
        })
      ).toThrow(/Hover budget blown for `_hoverVerbose`/)
    })
  })
})

describe('the never-check scan', () => {
  it('finds a check that was not tuple-wrapped', () => {
    // Split so that this file does not trip the scan it is testing — the same
    // discipline any prose about a directive has to follow. Do not
    // join it back into one literal.
    const offending = ['type A<X> = X extends', 'never ? 1 : 2'].join(' ')

    expect(findBareNeverChecks(offending)).toEqual([1])
  })

  it('sees a check broken across two lines', () => {
    const offending = ['type A<X> = X extends', '  never ? 1 : 2'].join('\n')

    expect(findBareNeverChecks(offending)).toEqual([1])
  })

  it('passes the tuple-wrapped form, an array, and a longer word', () => {
    expect(
      findBareNeverChecks('type A<X> = [X] extends [never] ? 1 : 2')
    ).toEqual([])
    expect(
      findBareNeverChecks('type A<X> = X extends never[] ? 1 : 2')
    ).toEqual([])
    expect(
      findBareNeverChecks('type A<X> = X extends nevermore ? 1 : 2')
    ).toEqual([])
  })

  it('holds over the whole type suite, and over the source it tests', () => {
    // `src/runtime/**` is scanned for the same reason the suite is: the code
    // must not use a weaker form than the assertions about
    // it. The stakes are higher there — the degradation lock mandates an explicit
    // `[Declared] extends [never]` collapse wherever an undeclared route's
    // `never` enters a generic position, and the unwrapped form is shorter,
    // reads correctly and *passes*, so a bare one in the published surface is a
    // silent bug rather than a weak test.
    const files = [
      ...globSync('**/*.ts', { cwd: TYPE_SUITE }).map(
        (file) => `${TYPE_SUITE}${file}`
      ),
      ...globSync('**/*.ts', { cwd: RUNTIME_SOURCE }).map(
        (file) => `${RUNTIME_SOURCE}${file}`
      ),
    ]

    expect(files.length).toBeGreaterThan(0)
    assertNoBareNeverChecks(files)
  })
})
