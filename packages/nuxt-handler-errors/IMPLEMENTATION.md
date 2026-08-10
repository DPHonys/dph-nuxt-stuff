# Implementation plan — nuxt-handler-errors v2

Orchestration bookkeeping for the rewrite. Working helper file; moved to
`to-delete/` when the implementation is complete.

## Sources of truth (read before implementing anything)

1. `packages/nuxt-known-errors/DESIGN.md` — **the design. Takes precedence
   over everything else.**
2. `packages/nuxt-known-errors/sandbox/matcher.ts` — the settled surface types
   (matchError, fetch/asyncData/server surfaces). Port, don't reinvent.
3. `packages/nuxt-known-errors/sandbox/glue/p2-array-spread.ts` — the settled
   definition surface (defineError, errors slot, brand, raise contract).
4. `packages/nuxt-known-errors/sandbox/glue/shared.ts` — payload, fail, the
   variant vocabulary.
5. `packages/nuxt-known-errors/sandbox/call-sites.ts` — every agreed call
   style, with assertions. These must keep working (adapted paths) as type
   tests.
6. `packages/nuxt-known-errors/INTERNALS-ANALYSIS.md` — per-piece take /
   adapt / drop verdict on the old package's internals.
7. `packages/nuxt-handler-errors-old/` — the old implementation, reference
   only. The new design wins on every conflict.

## Rules (apply to every phase)

- Comments: only where the code can't say it — short, relevant. No comment
  blocks on everything. Preserve the "expensive-to-rediscover" reasoning
  comments the analysis says to carry (emitter landmine, header merges,
  hook schedule).
- Verify with pnpm scripts before calling a phase done:
  `pnpm --filter @dphonys/nuxt-handler-errors typecheck`, `... test`,
  `... lint`, plus `pnpm format` at the root. Repo-wide `pnpm check` in
  Phase 7.
- Commit each phase with the `/commit` skill (conventional commits,
  scope `nuxt-handler-errors`).
- Tests are part of every phase, not a trailing phase: unit tests (vitest)
  and type tests (the old package's pos/neg fixture harness pattern where
  it earns its keep).
- Keep the old package's folder structure (`src/module.ts`, `src/emit-map.ts`,
  `src/runtime/{app,server,shared,types}`); file names may differ.
- Simplicity first: reach for meta-types only when the sandbox measured them
  necessary (§4 lists the ones that are). Use Nuxt/Nitro/h3-provided types —
  never retype what they export.
- Package identity: `@dphonys/nuxt-handler-errors`, module name
  `nuxt-handler-errors`, configKey `handlerErrors`. Wire marker
  `__knownError__`, handler brand `__knownErrors__`, generated interface
  `KnownApiErrors`, emitted specifier `@dphonys/nuxt-handler-errors/types`.

## Phases

| #   | Phase                                                                                                               | Status         |
| --- | ------------------------------------------------------------------------------------------------------------------- | -------------- |
| 0   | Rename old, scaffold, structure, plan                                                                               | done           |
| 1   | Core types + definition surface (`defineError`, `payload`, brand, `defineCheckedEventHandler`, `fail`, wire, raise) | done (758e7ec) |
| 2   | `matchError` (typed + degraded overloads, floor read)                                                               | done           |
| 3   | Fetch surfaces (`$checkedFetch` + `.try`, `useCheckedFetch` family, `event.$checkedFetch`)                          | done           |
| 4   | `useCheckedAsyncData` + lazy twin                                                                                   | done           |
| 5   | Emitter + module wiring                                                                                             | done           |
| 6   | Channel gating + observability recognizer                                                                           | pending        |
| 7   | Playground + e2e + repo-wide `pnpm check` + README                                                                  | pending        |
| 8   | `to-delete/` + final cleanup                                                                                        | pending        |

Statuses maintained by the orchestrator; a phase is `done` only after its
checks pass and its commit lands.

Open items carried between phases:

- Phase 1 deferred: the serializability constraint is not applied to a
  Standard Schema's inferred output (DESIGN §5 wants it on the inferred
  output too). Close by Phase 7 at the latest.
- `typecheck` needs `pnpm --filter @dphonys/nuxt-handler-errors dev:prepare`
  once first (playground resolves the built module).
- Phase 5 closed the Phase 3/4 registration items: all five app composables
  are auto-imported, all four keyed composables are pushed onto
  `optimization.keyedComposables` (`argumentLength: 3`, vanilla's own for both
  `useFetch` and `useAsyncData`), and the three plugins are registered.
- Phase 5 deferred the **rendering** half of the e2e map suite to Phase 7:
  `test/e2e/generated-map.test.ts` makes the structural claims against a real
  `nuxt prepare` (placement, route keys, hoist, the three context
  references), and `test/types/emitted-map.test.ts` makes the resolution claim
  against emitted trees. What waits on the playground is the render taken
  through a _real_ app program — the old package's hover budgets, the
  `event.$checkedFetch` server-program probe, and the broken-specifier fork of
  a real build.
- Phase 5 added `test/types/compile-harness.ts` (~170 lines) rather than
  porting the old package's 595-line harness: it compiles a fixture alone and
  renders one declaration, refusing to answer for a fixture that did not
  compile clean or that renders `any`. Hover _budgets_ are not ported; if
  Phase 7 wants them, that is where the measurements get retaken.
- Phase 4 moved the type suites' route fixture (the `InternalApi` and
  `KnownApiErrors` stand-ins) to `test/types/routes.ts`: both are global
  declaration merges, so a second suite restating them merges into the same
  interface. New type suites import it.

### Phase 1 — core types + definition surface

`src/runtime/types/` + `src/runtime/shared/` + `src/runtime/server/lib/`:

- Wire: `KnownErrorBody`, marker key constant, floor type
  `{ tag: string; status: number }`. Reserved names spread last. No
  `statusMessage` ever (`KnownRaiseInput` has `statusMessage?: never`).
- `payload<T>()` phantom + Standard Schema alternative
  (`@standard-schema/spec`, types-only, inference via `InferOutput`; never
  executed).
- `defineError` (arity-separated overloads), `KnownError`, `KnownErrorGroup`
  with permissive `.pick()`, runtime dedupe (one error per distinct tag,
  first wins), `ConflictGuard`/`DivergentTags` (IsUnion-per-tag, intersected
  first).
- Runtime brand: module-private symbol on every `KnownError` value (not
  `Symbol.for`); `defineCheckedEventHandler` verifies each element at
  declaration, foreign-copy error names the index.
- `defineCheckedEventHandler({ errors }, handler)` with `fail`; carries
  `__knownErrors__?` optional phantom out; unknown tag at runtime → plain
  `Error`. Raise through `createError` with marker under `data`,
  `fatal`/`unhandled` untouched.
- `KnownErrorsOfHandler` guarded extractor (unbranded → `never`, `any` →
  `never`).
- Core/module layering starts here: nothing in these files imports
  `@nuxt/kit`, `#app`, or Nitro runtime.
- Package subpath exports for `./types`, `./server`, `./shared` + typesVersions.

### Phase 2 — matchError

`src/runtime/shared/`: floor reader (typeof-checked, malformed → unknown,
both depths: `data.__knownError__` and `data.data.__knownError__`), arm
dispatch, required positional fallback `(err: NuxtError, unrecognized?)`.
Overload set per sandbox/matcher.ts exactly: typed overload generic over the
carrier, degraded overload takes `Record<string, never>`, returns `void`,
`MaybeRef` error parameter. Port the §4 constraints as type tests.

### Phase 3 — fetch surfaces

`src/runtime/app/` + `src/runtime/server/` + `src/runtime/shared/`:

- Seam interface `CheckedFetch` (call + `.try`), `$CheckedFetch` extends with
  `.raw`/`.create`; `.native` passthrough.
- One shared `.try` normalize function for both global and event surfaces;
  catches everything, normalizes to `NuxtError`, populates `status`.
  `{ data, error }` discriminated union.
- Header merges, all three forms exactly as the old package measured them
  (global Headers-form, event flatten-to-object, composable ref-unwrapping
  computed). `accept: application/json` on every request.
- Client app plugin + Nitro plugin for the global (one assignment each,
  `globalThis.$fetch` read at call time); separate Nitro plugin for
  `event.$checkedFetch` (request-hook placement, thunk + first-call guard).
- `useCheckedFetch` (five-overload mirror, error slot deleted),
  `useLazyCheckedFetch`, `useRequestCheckedFetch` (three-line mirror, seam
  return type).

### Phase 4 — asyncData surface

`src/runtime/app/composables/`: `useCheckedAsyncData` +
`useLazyCheckedAsyncData`; handler constrained to try-shape returns
(`TrySource`/`SuccessOf`/`FailureOf`); runtime is exactly unwrap-or-rethrow;
options are vanilla `AsyncDataOptions` over the unwrapped success.

### Phase 5 — emitter + module wiring

- `src/emit-map.ts`: port nearly whole; extractor becomes the guarded
  `KnownErrorsOfHandler` read wrapped in `Simplify<Serialize<…>>`
  (`Serialize<unknown> = never` belt stays). `KnownApiErrors` name. All
  mechanical hardening keeps (Map, escaping, codepoint sort, EMPTY_MAP,
  exported TYPES_SPECIFIER, `./`-forced specifiers, lowercased methods).
- `src/module.ts`: `nitro:init` → `types:extend` → `updateTemplates`
  schedule verbatim (capture Nitro instance from hook); `addTypeTemplate`
  `{ nitro: true, nuxt: true, shared: true }`; plugin split (client app
  plugin, Nitro global plugin, Nitro event plugin — separately deletable);
  `optimization.keyedComposables` × 4 names; custom errorHandler warning
  adapted to the chain seam; `ModuleOptions = {}`; compatibility ceiling.

### Phase 6 — channel gating + observability

- Token from runtimeConfig; `x-` header attached by every fetch surface via
  the existing three merge forms. Enabled by presence, no ModuleOptions.
- `nitro:config`: prepend to `errorHandler` array preserving entries;
  tokenless marked responses get `defaultHandler` body with marker stripped;
  token-carrying and foreign errors defer untouched. Dev builtin's `stack`
  nuance.
- Server-side recognizer over both marker depths + documented
  `unhandled === false` recipe.

### Phase 7 — playground, e2e, check, README

Playground routes exercising defineCheckedEventHandler / useCheckedFetch /
`.try` / asyncData / server-to-server; e2e wire + generated-map tests (old
package's e2e as reference); root `pnpm check` green; README rewritten for
the checked surface.

### Phase 8 — cleanup

`to-delete/` folder at repo root collecting: `packages/nuxt-handler-errors-old`,
`packages/nuxt-known-errors`, this file. Final commit.
