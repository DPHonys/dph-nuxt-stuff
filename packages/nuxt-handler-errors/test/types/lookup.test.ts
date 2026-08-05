import { fileURLToPath } from 'node:url'
import { describe, it } from 'vitest'
import { COMPILERS } from './compilers'
import { assertNoDiagnostics, createTypeHarness } from './harness'

/**
 * Layer 1 for `DeclaredErrorsOf` (SPEC.md §4.3, §6.1).
 *
 * The fixture is a hand-written map plus a hand-written `InternalApi`, compiled
 * alone. That is deliberately *weaker* evidence than
 * `test/generated-map.test.ts`, which renders the same lookup out of a real
 * Nuxt build and is the only thing that can catch a map whose specifiers
 * resolve to nothing. What this buys instead is a statement of the **rule**
 * that survives the real build breaking, and one that runs in milliseconds.
 */

const FIXTURE = fileURLToPath(new URL('pos/lookup.ts', import.meta.url))

describe.each(COMPILERS)(
  'naming a route’s declared union from its path alone, on %s',
  (_label, compiler, dialect) => {
    const harness = createTypeHarness({ ts: compiler, dialect })

    it('resolves every documented row, with controls', () => {
      // Every claim in the fixture is an `Expect<…>` alias, so the whole
      // assertion is that it compiles clean (SPEC.md §9.5 rule 3).
      assertNoDiagnostics(harness.compileAlone(FIXTURE))
    })
  }
)
