import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { COMPILERS } from './compilers'
import {
  assertHoverBudget,
  assertNoDiagnostics,
  createTypeHarness,
} from './harness'

/**
 * Layer 1 for the reader pair (SPEC.md §3.7, §5.3, §6.2, §6.4).
 *
 * The fixture is compiled against a replica of h3's and Nuxt's error types
 * rather than the real ones — `../replica.ts` records why — so a claim made
 * here cannot pass by having quietly degraded to `any`. The real types are met
 * at layer 3 in `playground/`, and the runtime guard is `test/reader.test.ts`.
 */

const FIXTURE = fileURLToPath(new URL('pos/reader.ts', import.meta.url))

/**
 * The hover a caller actually consults when writing their `switch`
 * (SPEC.md §8.3, §9.3).
 *
 * **measured 194 flat / 333 as the `Serialize` residue SPEC.md §8.3(a)
 * describes** — the bad half taken by handing the reader the identical union
 * spelled `Simplify<Serialize<…>>`, which is what the map would carry if the
 * emitter stopped evaluating it. Set at ~1.5× the good value, per SPEC.md §9.3.
 *
 * This is the one budget that makes the envelope-shaped `error.value` hover
 * acceptable: SPEC.md §8.3's table grades that surface *"honest, envelope-
 * shaped"* and grades this one ✅ precisely because it is where the user's
 * attention moves.
 */
const READER_RETURN_BUDGET = 290

describe.each(COMPILERS)(
  'reading a declared variant out of an error value, on %s',
  (_label, compiler, dialect) => {
    const harness = createTypeHarness({ ts: compiler, dialect })

    it('holds every claim SPEC.md §3.7 makes, against a framework replica', () => {
      // Every claim in the fixture is an `Expect<…>` alias, an exhaustive
      // `switch` or a consumed `@ts-expect-error`, so the whole assertion is
      // that it compiles clean (SPEC.md §9.5 rule 3).
      assertNoDiagnostics(harness.compileAlone(FIXTURE))
    })

    it('renders the reader’s return as the flat variant union, in budget', () => {
      const compilation = harness.compileAlone(FIXTURE)

      const rendered = assertHoverBudget(compilation, {
        name: '_readerReturn',
        max: READER_RETURN_BUDGET,
      })

      // Length alone would pass against a union that had lost its payloads, so
      // the render is also checked for the thing the caller reads it for. Tags
      // are written in a type annotation in this fixture, so the bridge
      // renders them **single**-quoted (SPEC-AMENDMENTS item 7) — and stock
      // double-quotes the same position, the measured quote-style divergence.
      const quote = dialect === 'stock' ? '"' : `'`
      expect(rendered).toContain(`${quote}user-not-found${quote}`)
      expect(rendered).toContain('userId')
      expect(rendered).toContain('requiredRole')
      // Flat: no intersection survives into the hover, and no `Serialize`
      // residue.
      expect(rendered).not.toContain('} & {')
      expect(rendered).not.toContain('Serialize')
    })
  }
)
