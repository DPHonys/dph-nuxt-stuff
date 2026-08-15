# nuxt-handler-validation v2 — implementation plan

The spec is [DESIGN.md](./DESIGN.md) and this package's `src/` — the locked
surface, the locked decisions, and the sandbox files that pin ergonomics and
diagnostics. The strategy: v1 was never actually released, so it steps aside
under an `-old` name as reference material, a fresh package is scaffolded
under the real name, v2 is implemented there, and at the end both the `-old`
package and this sandbox disappear.

Each phase ends with the canonical checks green: `pnpm run check` and
`pnpm run knip`.

## Phase 0 — retire v1 in place

1. `git mv packages/nuxt-handler-validation packages/nuxt-handler-validation-old`.
2. In its `package.json`: rename to `@dphonys/nuxt-handler-validation-old`
   and add `"private": true` — it must never publish. Change nothing else:
   its build, tests and playground stay green and runnable, because they are
   the reference corpus v2 ports from.
3. Delete the pending release intent `.changeset/good-seals-press.md` — it
   describes v1's `defineValidation` model and belongs to a package that will
   never publish. v2 writes its own intent in phase 5. (`ledger.yaml` is
   untouched: it records only consumed intents, all for the sibling.)
4. `knip.ts`: rename the two workspace keys
   (`packages/nuxt-handler-validation` and its `/playground`) to the `-old`
   paths.
5. `pnpm install` to refresh the lockfile.

## Phase 1 — scaffold the new package

1. Scaffold non-interactively (passing any flag opts out of the prompts;
   `--template` and `--name` are required together, `--description` optional):

   ```sh
   pnpm scaffold --template nuxt-module --name nuxt-handler-validation \
     --description "Declare a Nitro handler's request schemas once and receive the validated, fully-typed values in the handler's second parameter."
   ```

2. `pnpm install`; the empty scaffold must pass the canonical checks before
   any v2 code lands.

## Phase 2 — the locked surface, types first

Move the sandbox's declared surface into the scaffold, keeping every public
name exactly as locked:

- `src/types.ts` → the runtime types tree behind the `/types` entry:
  `ValidationSchemas`, `SourceSchemas`, `ValidationSource`,
  `ValidatedContext`, `SourceValue`, `MergedOutput`, `OutputOf`,
  `ValidationIssue`, `ValidationErrorData`.
- `src/internal.ts` → internal guard module (`ValidationSchemasGuard`,
  `ValidationDeclarationError`, `IsMergeableOutput`, `HasKeyOverlap`) —
  never exported from a public entry.
- `src/server.ts`'s two signatures → the `/server` entry, bodies to follow in
  phase 3.
- Package exports mirror v1's map: `.` (module), `/types` (type-only),
  `/server` (runtime). Auto-imports inside `server/`: exactly
  `defineValidatedEventHandler` and `recognizeValidationError`.

## Phase 3 — runtime, reusing v1's good organs

From `packages/nuxt-handler-validation-old/src/runtime`, port nearly
verbatim: the error marker (`shared/error-marker.ts`), the issue projection
(`server/lib/issues.ts`), the predicate
(`server/lib/recognize-validation-error.ts`), and the per-source reading
rules in `server/lib/sources.ts` (h3 raw shapes, bodyless methods validating
`undefined`, an unreadable body becoming one `source: "body"` issue).
`module.ts` ports with the same zero-options, off-switch posture.

Not ported, dying with v1: `declaration.ts`, `fragments.ts`,
`types/composition.ts`, `types/guard.ts`, and the overloads in
`validated-handler.ts`.

The rewritten wrapper implements the locked runtime contract per source, in
the fail-fast order:

1. Normalize the slot to an element list (bare schema = one element).
2. Run every element **sequentially, in tuple order**, aggregating that
   source's issues; a failed source answers the one `400` wire shape with
   all of them.
3. Merge outputs by object spread in tuple order (later-wins for the
   overlaps types could not see). A non-object element output in a merge is
   a `500` naming the source and element position, **unmarked**.

## Phase 4 — tests

- **Type tests**: port `src/sandbox/{basic,reuse,misuse}.ts` into the
  package's compile-harness pattern (v1's `test/types/fixtures` +
  `compile-harness.ts`, which asserts on diagnostics). The misuse fixtures
  assert the three guard sentences verbatim — they are public surface.
- **Ported runtime suites** from `-old`, minus everything composition:
  wire shape, marker-never-reaches-a-client, source reading rules, body
  rules, observability recipe.
- **New runtime suites** for the locked decisions: all tuple elements run
  and issues aggregate; later-wins merge order; non-object output → 500 and
  `recognizeValidationError` returns `undefined` for it; async schemas run
  sequentially in order.

## Phase 5 — docs and release intent

1. README rewritten from DESIGN.md — v1's README structure minus the
   `defineValidation`/composition sections, plus the tuple model and the
   runtime-mirror table.
2. `pnpm change`: one `minor` intent for `@dphonys/nuxt-handler-validation`
   describing the v2 model, then `pnpm run format:fix` (generated
   frontmatter fails the format check otherwise).
3. `knip.ts`: give the new package the fixture-entry block v1 had, if the
   test harness recreated `test/types/fixtures` / `test/fixtures`.

## Phase 6 — make v1 and the sandbox disappear

Only after phase 4 and 5 are green and reviewed:

1. Delete `packages/nuxt-handler-validation-old` and
   `packages/nuxt-handler-validation-sandbox` (this plan and DESIGN.md go
   with it — the README and the type tests are the surviving spec).
2. `knip.ts`: remove the `-old` and sandbox workspace entries.
3. `pnpm install`, canonical checks, done.
