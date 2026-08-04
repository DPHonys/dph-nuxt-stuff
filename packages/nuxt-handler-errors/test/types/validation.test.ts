import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import {
  assertDiagnostic,
  assertHoverBudget,
  assertNoDiagnostics,
  createTypeHarness,
} from './harness'

/**
 * Layer 1 for the validation surface (SPEC.md §9.1): every type-level
 * guarantee schemas-on-the-options-object make, the four things that must not
 * compile, and the one rendering mandate SPEC.md §8.3(c) states in characters.
 *
 * The runtime half — what an untrusted body actually becomes — is
 * `../validation.test.ts`, and the wire half is `../wire.test.ts`.
 */

/** SPEC.md §9.8: the compiler is a parameter. One row today. */
const COMPILERS = [['typescript-native-bridge (the pinned gate)', ts]] as const

/**
 * **SPEC.md §8.3(c), in characters.** An array-valued payload field keeps its
 * `Serialize` residue in the hover whatever it is made of — Nitro's `Simplify`
 * is `TType extends any[] | Date ? TType : {…}` and short-circuits on arrays —
 * so the only thing that decides legibility is whether the element type has a
 * name to render. Measured on `pos/validation.ts`, which carries both
 * spellings of the same field side by side:
 *
 * | spelling | rendered |
 * | --- | --- |
 * | `ValidationIssue`, a named interface — shipped | **54** |
 * | the same three fields written inline | **125** |
 *
 * The budget sits between them at ~1.5× the good value, per SPEC.md §9.3, and
 * the inline spelling is asserted to blow it — so the mutation that would break
 * the mandate is *in the fixture*, permanently, rather than something a future
 * reader has to reproduce by hand.
 *
 * Note that `not.toContain('SerializeObject')` — the companion guard everywhere
 * else in this suite — would be **wrong** here. The residue is unavoidable on
 * this surface and SPEC.md §8.3(c) is the section that says so; the name inside
 * it is the whole of what is being claimed.
 */
const ISSUES_HOVER_BUDGET = 85

describe.each(COMPILERS)('validating input, on %s', (_label, compiler) => {
  const harness = createTypeHarness({ ts: compiler })

  describe('the validation surface', () => {
    it('holds every positive claim, with zero diagnostics', () => {
      assertNoDiagnostics(harness.compileAlone('pos/validation.ts'))
    })

    it('renders an array-valued payload field through its element name', () => {
      const compilation = harness.compileAlone('pos/validation.ts')

      const rendered = assertHoverBudget(compilation, {
        name: '_hoverIssues',
        max: ISSUES_HOVER_BUDGET,
      })

      // The name is the deliverable: it is what an editor makes clickable, and
      // it is the only thing standing between the reader and the expanded
      // literal below.
      expect(rendered).toContain('ValidationIssue')

      // The mutation, carried in the fixture: the same field with its element
      // type written inline blows the same budget.
      expect(() =>
        assertHoverBudget(compilation, {
          name: '_hoverInlineIssues',
          max: ISSUES_HOVER_BUDGET,
        })
      ).toThrow(/Hover budget blown/)
    })
  })

  describe('what must not compile', () => {
    it("rejects h3's own `safeParse` spelling, which silently disables validation there", () => {
      assertDiagnostic(harness.compileAlone('neg/validation-safe-parse.ts'), {
        code: 2322,
        message:
          "Type '(value: unknown) => { success: true; data: { name: string; }; }' is not assignable to type 'StandardSchemaV1",
      })
    })

    it('rejects a plain-function validator, which is the same shape', () => {
      assertDiagnostic(
        harness.compileAlone('neg/validation-plain-function.ts'),
        {
          code: 2322,
          message:
            "Type '(value: unknown) => { name: string; }' is not assignable to type 'StandardSchemaV1",
        }
      )
    })

    it('rejects destructuring a location the route never declared', () => {
      // Naming `body` in the expectation is what makes this bite: the message
      // renders the whole context type, so the assertion is simultaneously
      // that `params` is absent and that the declared location is present.
      assertDiagnostic(
        harness.compileAlone('neg/validation-undeclared-location.ts'),
        {
          code: 2339,
          message:
            "Property 'params' does not exist on type 'TypedHandlerContext",
        }
      )
    })

    it('rejects an `invalid-input` payload the module cannot fill, naming the field', () => {
      // Guard-first, and this is what that mandate buys: the offending field
      // name survives in front of TypeScript's truncation of the rendered
      // parameter's tail, which in this diagnostic really does elide the
      // catalogue's own payload (`& { ...; }`).
      const compilation = harness.compileAlone(
        'neg/validation-unfillable-payload.ts'
      )

      assertDiagnostic(compilation, {
        code: 2345,
        message:
          'The `invalid-input` variant declares a payload this module cannot fill: requestId',
      })

      // SPEC.md §9.2 names the marker *property* for this row, and the sentence
      // above would survive a guard-last regression that still rendered it. The
      // property name is what only guard-first puts at the head of the
      // parameter, so it is the half that measures the mandate rather than the
      // message.
      assertDiagnostic(compilation, {
        code: 2345,
        message: '__invalidValidationPayload__',
      })
    })
  })
})
