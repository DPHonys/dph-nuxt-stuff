import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import {
  assertDiagnostic,
  assertHoverBudget,
  assertNoDiagnostics,
  createTypeHarness,
} from './harness'

/**
 * Layer 1 for `$typedFetch` and `$typedFetch.safe` (SPEC.md §3.5, §6.1,
 * §8.3(b)).
 *
 * ## Why these fixtures have their own config
 *
 * Every claim on this surface goes through a **call**, and a call is typed by
 * `NitroFetchRequest` — which terminates in ofetch's `FetchRequest`, i.e.
 * `RequestInfo | URL`, both of which live in `lib.dom`. Under the base fixture
 * config's `lib: ["ESNext"]` they resolve to nothing, `skipLibCheck` swallows
 * the diagnostic, and a route literal infers as `any`: `await
 * $fetch('/api/users/123')` comes back `unknown` and every assertion about it
 * is vacuously about `unknown`. `tsconfig.fetch-fixtures.json` is the base
 * config plus `DOM` and nothing else.
 *
 * The lookup fixtures never noticed because `MatchedRoutes` and
 * `TypedInternalResponse` touch no ofetch type at all.
 */

const HARNESS_ROOT = fileURLToPath(new URL('.', import.meta.url))
const FIXTURE = 'pos/typed-fetch.ts'

/**
 * SPEC.md §8.3(b), re-measured on this surface.
 *
 * **measured 39 as a named `interface` / 221 as an inline object type** — and
 * the bad half writes out only the call signature and `safe`, leaving `raw` and
 * `create` off entirely, so it understates the regression rather than
 * flattering it.
 *
 * Set at ~2× the good value rather than SPEC.md §9.3's usual 1.5×, for the
 * reason `use-typed-fetch.test.ts` gives: the good value is a name plus its two
 * type arguments, and one of those is a name from another package.
 */
const TYPED_FETCH_BUDGET = 80

describe('$typedFetch, over a hand-written map', () => {
  const harness = createTypeHarness({
    ts,
    rootDir: HARNESS_ROOT,
    tsconfigPath: 'tsconfig.fetch-fixtures.json',
  })

  it('holds every claim SPEC.md §3.5 makes about the namespace', () => {
    // The fixture is `Expect<…>` aliases, exhaustive `switch`es whose missing
    // final `return` is the assertion, and destructurings that are a compile
    // error without the undeclared collapse — so the whole claim is that it
    // compiles clean (SPEC.md §9.5 rule 3). Nothing is filtered by file: it
    // calls `$typedFetch` and `$fetch` with identical arguments, so a
    // diagnostic anywhere in the program is a reason to disbelieve the pairs.
    assertNoDiagnostics(harness.compileAlone(FIXTURE))
  })

  it('renders as its own interface name, not as its namespace', () => {
    const compilation = harness.compileAlone(FIXTURE)

    const rendered = assertHoverBudget(compilation, {
      name: '_$typedFetch',
      max: TYPED_FETCH_BUDGET,
    })

    expect(rendered).toContain('$TypedFetch')

    // The mutation, committed rather than described: the same namespace as an
    // inline object type is in the same fixture, and this is what it costs.
    // Nitro declares `var $fetch: $Fetch` for exactly this reason.
    expect(compilation.renderHover('_bare$typedFetch').length).toBeGreaterThan(
      TYPED_FETCH_BUDGET
    )
  })

  it('leaves the throwing form byte-identical to vanilla', () => {
    // SPEC.md §6.1's degradation lock on the default entry point, in the
    // strongest form the claim has: not "assignable to", not "equal by
    // `Equal<…>`" — the same characters. `Equal<…>` over the same pair is in
    // the fixture and is the cheaper guard; this is the one that also catches
    // the two being structurally equal while the typed answer has grown an
    // alias a caller would have to read through.
    const compilation = harness.compileAlone(FIXTURE)

    expect(compilation.renderHover('_typedThrown')).toBe(
      compilation.renderHover('_vanillaThrown')
    )
  })

  it('keeps the false arm on a route that declared something', () => {
    // The control for the collapse. Without it the assertion above — that an
    // undeclared route's `data` is reachable without branching — would pass
    // just as well against a `TypedResult` that had degraded to one arm
    // everywhere, i.e. against a safe channel typed as if failure were
    // impossible.
    assertDiagnostic(harness.compileAlone('neg/safe-unbranched-data.ts'), {
      code: 2339,
      message: 'data',
    })
  })

  it('keeps a payload behind the tag, so the union is a real one', () => {
    // And the false arm carries a discriminated union rather than
    // SPEC.md §5.3's shape floor or TypeScript's error type — either of which
    // would let this read through (SPEC-AMENDMENTS item 9).
    assertDiagnostic(harness.compileAlone('neg/safe-unnarrowed-payload.ts'), {
      code: 2339,
      message: 'userId',
    })
  })
})
