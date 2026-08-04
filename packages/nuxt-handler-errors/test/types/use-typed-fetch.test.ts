import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import {
  assertHoverBudget,
  assertNoDiagnostics,
  createTypeHarness,
} from './harness'

/**
 * Layer 1 for `useTypedFetch` (SPEC.md §3.4, §6.1, §8.3(b)).
 *
 * ## Why this one fixture has its own config
 *
 * The composable is app-side code: it imports `useFetch` from `#app`, which
 * `tsconfig.fixtures.json` cannot resolve. The **package's own** `tsconfig.json`
 * can — it extends the `.nuxt/tsconfig.json` the module builder generates — and
 * it brings a second property this fixture depends on: it *excludes* the two
 * fixtures that augment `InternalApi` (SPEC-AMENDMENTS item 18), so the route
 * interface in this program is empty.
 *
 * **An empty `InternalApi` is the fixture, not a limitation.** Every route is
 * then an undeclared route, which is the only condition under which SPEC.md
 * §6.1's degradation lock can be stated as *"byte-identical to vanilla"* and
 * meant literally — the two renders below are compared character for character.
 * The declared side needs a generated map and is asserted at layer 3.
 */

const FIXTURE = fileURLToPath(
  new URL('pos/use-typed-fetch.ts', import.meta.url)
)
const PACKAGE_TSCONFIG = fileURLToPath(
  new URL('../../tsconfig.json', import.meta.url)
)

/**
 * SPEC.md §9.3's first budget, re-measured here (SPEC.md §8.3(b)).
 *
 * **measured 64 as a named `interface` / 560 as a bare `function` declaration**
 * — and the bad half writes out only *one* of the five overloads, so it
 * understates the regression roughly fivefold rather than flattering it. The
 * prototype's pair was 55 / 1075 on a bigger signature; vanilla `useFetch`
 * renders 94 for exactly this reason.
 *
 * Set at ~2× the good value rather than SPEC.md §9.3's usual 1.5×, because the
 * good value here is an import path plus a name and the path is a property of
 * where the fixture sits.
 */
const USE_TYPED_FETCH_BUDGET = 150

describe('useTypedFetch, against Nuxt’s real types', () => {
  const harness = createTypeHarness({
    ts,
    rootDir: fileURLToPath(new URL('../..', import.meta.url)),
    tsconfigPath: PACKAGE_TSCONFIG,
  })

  it('holds every claim SPEC.md §3.4 makes about the call surface', () => {
    // Every claim in the fixture is an `Expect<…>` alias or a call that has to
    // resolve, so the whole assertion is that it compiles clean
    // (SPEC.md §9.5 rule 3). Nothing is filtered by file: the fixture calls
    // both wrappers *and* vanilla with identical arguments, so a diagnostic
    // anywhere in the program is a reason to disbelieve the pairs.
    assertNoDiagnostics(harness.compileAlone(FIXTURE))
  })

  it('renders as its own interface name, not as its signature', () => {
    const compilation = harness.compileAlone(FIXTURE)

    const rendered = assertHoverBudget(compilation, {
      name: '_useTypedFetch',
      max: USE_TYPED_FETCH_BUDGET,
    })

    expect(rendered).toContain('UseTypedFetch')

    // The mutation, committed rather than described: the identical signature as
    // a bare `function` declaration is in the same fixture, and this is what
    // it costs. Without SPEC.md §8.3(b)'s mandate the line above renders this.
    expect(
      compilation.renderHover('_bareUseTypedFetch').length
    ).toBeGreaterThan(USE_TYPED_FETCH_BUDGET)
  })

  it('leaves an undeclared route’s error channel byte-identical to vanilla', () => {
    // SPEC.md §6.1's degradation lock, and the strongest form the claim has:
    // not "assignable to", not "equal by `Equal<…>`" — the same characters.
    //
    // `Equal<…>` over the same pair is in the fixture and is the cheaper guard;
    // this is the one that also catches the two types being structurally equal
    // while the wrapper's answer has grown an alias a caller would have to
    // read through.
    const compilation = harness.compileAlone(FIXTURE)

    const typed = compilation.renderHover('_typedUndeclaredError')
    const vanilla = compilation.renderHover('_vanillaUndeclaredError')

    expect(typed).toBe(vanilla)
    // And it is vanilla's own envelope rather than a lookalike: `unknown` is
    // what makes `error.value.data` reachable at all. Measured, the collapse
    // deleted: `NuxtError<DeclaredErrorBody<never>>`, which is *narrower* than
    // this and leaves that payload uninhabited.
    expect(typed).toContain('NuxtError<unknown>')
    expect(typed).not.toContain('DeclaredErrorBody')
  })
})
