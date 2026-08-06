import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, it } from 'vitest'
import { assertNoDiagnostics, createTypeHarness } from './harness'

/**
 * Layer 1 for `DeclaredErrorsOf`.
 *
 * The fixture is a hand-written map plus a hand-written `InternalApi`, compiled
 * alone. That is deliberately *weaker* evidence than
 * `test/generated-map.test.ts`, which renders the same lookup out of a real
 * Nuxt build and is the only thing that can catch a map whose specifiers
 * resolve to nothing. What this buys instead is a statement of the **rule**
 * that survives the real build breaking, and one that runs in milliseconds.
 */

const FIXTURE = fileURLToPath(new URL('pos/lookup.ts', import.meta.url))

describe('naming a route’s declared union from its path alone', () => {
  const harness = createTypeHarness({ ts })

  it('resolves every documented row, with controls', () => {
    // Every claim in the fixture is an `Expect<…>` alias, so the whole
    // assertion is that it compiles clean.
    assertNoDiagnostics(harness.compileAlone(FIXTURE))
  })
})
