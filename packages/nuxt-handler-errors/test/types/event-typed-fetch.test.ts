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
 * Layer 1 for `event.$typedFetch` (SPEC.md §3.6, §6.1, §8.3(b)).
 *
 * These fixtures use `tsconfig.fetch-fixtures.json` for the reason
 * `typed-fetch.test.ts` records: every claim on this surface goes through a
 * **call**, and a call is typed by `NitroFetchRequest`, which terminates in
 * ofetch's `FetchRequest` — `RequestInfo | URL`, both of which live in
 * `lib.dom`. Under the base config's `lib: ["ESNext"]` they resolve to nothing,
 * `skipLibCheck` swallows the diagnostic, and every assertion becomes vacuously
 * about `unknown` (SPEC-AMENDMENTS item 40).
 */

const HARNESS_ROOT = fileURLToPath(new URL('.', import.meta.url))
const FIXTURE = 'pos/event-typed-fetch.ts'

/**
 * SPEC.md §8.3(b) on this surface.
 *
 * **measured 16** — the interface's own name and nothing else, because
 * `Event$TypedFetch` fixes both of `Base$TypedFetch`'s type arguments and has
 * none of its own; the global's twin measures 39 for the same reason it carries
 * two. The inline-object control is committed in `pos/typed-fetch.ts` and
 * measures 221 there, and it is not duplicated: what this budget checks is that
 * reaching the interface through `event.` costs nothing extra.
 *
 * Set at ~2× the good value, the ratio `typed-fetch.test.ts` uses on the same
 * grounds — the good value is a single name, so SPEC.md §9.3's usual 1.5×
 * would leave no room for renaming it.
 */
const EVENT_TYPED_FETCH_BUDGET = 32

describe('event.$typedFetch, over a hand-written map', () => {
  const harness = createTypeHarness({
    ts,
    rootDir: HARNESS_ROOT,
    tsconfigPath: 'tsconfig.fetch-fixtures.json',
  })

  it('holds every claim SPEC.md §3.6 makes about the namespace', () => {
    // The fixture is `Expect<…>` aliases, exhaustive `switch`es whose missing
    // final `return` is the assertion, and a destructuring that is a compile
    // error without the undeclared collapse — so the whole claim is that it
    // compiles clean (SPEC.md §9.5 rule 3). Nothing is filtered by file: it
    // calls `event.$typedFetch` and `event.$fetch` with identical arguments, so
    // a diagnostic anywhere in the program is a reason to disbelieve the pairs.
    assertNoDiagnostics(harness.compileAlone(FIXTURE))
  })

  it('has no raw member and no instance-creating member', () => {
    // SPEC.md §3.6's *"not a copy of `$TypedFetch`"*, in the form `keyof`
    // cannot make: an index signature would satisfy the `keyof` assertion in
    // the positive fixture and still let both of these through.
    const compilation = harness.compileAlone('neg/event-fetch-namespace.ts')

    assertDiagnostic(compilation, { code: 2339, message: 'raw' })
    assertDiagnostic(compilation, { code: 2339, message: 'create' })
  })

  it('renders as its own interface name', () => {
    const compilation = harness.compileAlone(FIXTURE)

    const rendered = assertHoverBudget(compilation, {
      name: '_event$TypedFetch',
      max: EVENT_TYPED_FETCH_BUDGET,
    })

    expect(rendered).toContain('Event$TypedFetch')
  })

  it('leaves the throwing form byte-identical to event.$fetch', () => {
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
})
