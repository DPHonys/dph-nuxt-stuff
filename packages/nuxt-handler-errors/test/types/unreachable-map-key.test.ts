import { fileURLToPath } from 'node:url'
import { describe, it } from 'vitest'
import { COMPILERS } from './compilers'
import { assertNoDiagnostics, createTypeHarness } from './harness'

/**
 * SPEC.md §9.6, taken literally: *"That property is testable hermetically at
 * layer 1"*.
 *
 * The dev-server race is real, and it gets **no timing test** — a persistent
 * dev server inside `pnpm check` is flaky by construction and is the first
 * thing disabled on a loaded CI box. What replaces it is this: the invariant
 * that makes the window harmless, with no Nuxt, no Nitro and no clock in the
 * path. `pnpm dev-race` and `pnpm dev-race:direction` ship as ungated
 * diagnostics for when a Nuxt or Nitro bump is suspected.
 *
 * `test/generated-map.test.ts` re-takes the same claim against a real app's
 * own generated `InternalApi`, which is stronger evidence and free there. The
 * duplication is deliberate: that one is gated behind two real builds, and this
 * invariant should survive them breaking.
 */

const FIXTURE = fileURLToPath(
  new URL('pos/unreachable-map-key.ts', import.meta.url)
)

describe.each(COMPILERS)(
  'a key the map holds and Nitro’s interface does not, on %s',
  (_label, compiler, dialect) => {
    const harness = createTypeHarness({ ts: compiler, dialect })

    it('is unreachable through MatchedRoutes, with a reachable control', () => {
      // Both claims are `Expect<…>` aliases in the fixture, so the whole
      // assertion is that it compiles clean (SPEC.md §9.5 rule 3).
      assertNoDiagnostics(harness.compileAlone(FIXTURE))
    })
  }
)
