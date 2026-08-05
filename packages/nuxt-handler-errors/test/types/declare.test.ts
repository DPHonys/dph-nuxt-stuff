import { describe, it } from 'vitest'
import { COMPILERS } from './compilers'
import {
  assertDiagnostic,
  assertHoverBudget,
  assertNoDiagnostics,
  createTypeHarness,
} from './harness'

/**
 * Layer 1 for the declaration surface (SPEC.md §9.1): every type-level
 * guarantee `defineErrors`, `payload` and `defineTypedEventHandler` make, and
 * the only layer that can assert a *rendering*.
 *
 * The positive fixtures carry their own `Expect<Equal<…>>` claims and are
 * asserted here to compile with **zero** diagnostics; the negative ones are
 * compiled alone and matched on a code **plus** a message substring, because
 * "some error happened" is not an assertion (SPEC.md §9.2, §9.5).
 */

/**
 * SPEC.md §8.3(b): every callable is a named `interface` with the value a
 * `const` of that type, so a hover renders the interface's name instead of an
 * expanded generic signature. Measured in this package, on this fixture, with
 * import specifiers canonicalized (identical under both compilers):
 *
 * | target                    | named interface | bare `function` |
 * | ------------------------- | --------------- | --------------- |
 * | `defineTypedEventHandler` | 35              | 546             |
 * | `defineErrors`            | 24              | 160             |
 * | `payload`                 | 25              | —               |
 *
 * The budget sits at ~1.5× the worst good value, per SPEC.md §9.3, so a
 * failure reads as *"the named-interface mandate broke"* rather than as a
 * number moving. The `import("…")` prefix the renderer adds for a symbol with
 * no local alias is collapsed to a fixed token before measuring — the path
 * inside it was two thirds of the old measurement, all of it noise, and the
 * canonicalized lengths are byte-identical under both compilers.
 */
const CALLABLE_HOVER_BUDGET = 53

describe.each(COMPILERS)(
  'the declaration surface, on %s',
  (_label, compiler, dialect) => {
    const harness = createTypeHarness({ ts: compiler, dialect })

    describe('the declaration surface', () => {
      it('holds every positive claim, with zero diagnostics', () => {
        assertNoDiagnostics(harness.compileAlone('pos/declare.ts'))
      })

      it('composes two catalogues declaring an identical member, clean', () => {
        // The other half of the duplicate guard, and the easy half to lose: an
        // identical re-declaration collapses to one union member and must not
        // be flagged (SPEC.md §3.2).
        assertNoDiagnostics(harness.compileAlone('pos/identical-duplicate.ts'))
      })

      it('renders each callable as its interface name, not its signature', () => {
        const compilation = harness.compileAlone('pos/declare.ts')

        assertHoverBudget(compilation, {
          name: '_hoverDefineTypedEventHandler',
          max: CALLABLE_HOVER_BUDGET,
        })
        assertHoverBudget(compilation, {
          name: '_hoverDefineErrors',
          max: CALLABLE_HOVER_BUDGET,
        })
        assertHoverBudget(compilation, {
          name: '_hoverPayload',
          max: CALLABLE_HOVER_BUDGET,
        })
      })
    })

    describe('what must not compile', () => {
      it('rejects a tag the route never declared, naming the ones it did', () => {
        assertDiagnostic(harness.compileAlone('neg/undeclared-tag.ts'), {
          code: 2345,
          message: '"unauthorized" | "user-not-found"',
        })
      })

      it('rejects a duplicate tag across composed catalogues, guard-first', () => {
        // THE guard-first assertion (SPEC.md §3.2, §9.2). Matching the guard's
        // own sentence rather than the bare tag is what makes it bite:
        // `forbidden` also appears inside the rendered catalogue types, so
        // `toContain('forbidden')` passes either way. Measured with the
        // intersection reversed, the parameter renders
        // `{ errors: …ErrorCatalogue<...>]; } & { ...; }` — the collision is
        // still detected and the tag is truncated clean away.
        //
        // This deliberately couples the suite to TypeScript's truncation
        // length. A compiler bump that truncates the tag away has genuinely
        // broken the mandate, and a red test is the correct outcome.
        assertDiagnostic(harness.compileAlone('neg/tag-conflict.ts'), {
          code: 2345,
          message: 'Duplicate error tag across composed catalogues: forbidden',
        })
      })

      it('rejects an explicit type argument by arity, never with a silent any', () => {
        // What the mandate is about — `Response` having no default, so one
        // explicit argument cannot silently collapse the success type — rides on
        // the arity error itself; the exact number moves the day a new type
        // parameter lands, and this line is where it is quoted from.
        assertDiagnostic(
          harness.compileAlone('neg/explicit-type-argument.ts'),
          {
            code: 2558,
            message: 'Expected 2-3 type arguments, but got 1',
          }
        )
      })

      it('rejects `.pick()` of an unknown tag, listing the real tags', () => {
        // The same union, ordered differently: the bridge sorts the members
        // alphabetically, stock lists them in declaration order. Both
        // messages name all three real tags, which is the claim.
        assertDiagnostic(harness.compileAlone('neg/pick-unknown-tag.ts'), {
          code: 2345,
          message: '"forbidden" | "token-expired" | "unauthorized"',
          stock: {
            message: '"unauthorized" | "forbidden" | "token-expired"',
          },
        })
      })

      it('rejects a payload whose shape does not match the variant', () => {
        assertDiagnostic(harness.compileAlone('neg/payload-shape.ts'), {
          code: 2322,
          message: `Type '"superuser"' is not assignable to type '"admin" | "owner"'`,
        })
      })

      it('rejects a second argument to a payload-less variant', () => {
        assertDiagnostic(harness.compileAlone('neg/payload-arity-extra.ts'), {
          code: 2554,
          message: 'Expected 1 arguments, but got 2',
        })
      })

      it('rejects a missing payload on a variant that declares one', () => {
        assertDiagnostic(harness.compileAlone('neg/payload-arity-missing.ts'), {
          code: 2554,
          message: 'Expected 2 arguments, but got 1',
        })
      })

      it('rejects a payload field that JSON serialization would throw on', () => {
        // The message has to name the field: a guard that only said "this
        // payload is bad" would leave the author looking for which of eight
        // fields it meant (SPEC.md §3.2). Same red through a different door on
        // stock — the bridge reports the missing property, stock reports the
        // constraint the property was missing from — and the field's name
        // survives in both messages, which is what the mandate asks.
        assertDiagnostic(
          harness.compileAlone('neg/unserializable-payload.ts'),
          {
            code: 2741,
            message:
              'Payload field does not survive JSON serialization: outstanding',
            stock: {
              code: 2344,
              message:
                'Payload field does not survive JSON serialization: outstanding',
            },
          }
        )
      })
    })
  }
)
