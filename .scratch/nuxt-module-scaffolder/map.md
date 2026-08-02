# Wayfinder map: Repository-owned Nuxt module scaffolder

## Destination

An implementation-ready specification for a repository-owned, interactive Nuxt module scaffolder. The specification must leave no unresolved product or technical decisions about creating a production-ready Nuxt 4+ module package under `packages/` from the repository root.

## Notes

- This effort ends at an implementation-ready specification and ticket map; implementing the scaffolder is outside this map.
- Treat the `module-template` branch only as a source of proven Nuxt module structure. Target a clean future implementation on the current `main` architecture; do not merge the branch wholesale.
- The developer-facing tool is the **scaffolder**. Its root command is `pnpm scaffold`.
- Version one is interactive-only. It ships one real template kind, **Nuxt module**, behind an extensible internal registry.
- A single kebab-case scaffold name derives `packages/<name>`, `@dphonys/<name>`, the Nuxt module name, the config key, and the display name. A conventional leading `nuxt-` is omitted from the consumer-facing config key and runtime injection when the remainder begins with a letter. Description is a separate optional input.
- The generated module targets Nuxt 4+, uses the fixed `@dphonys` npm scope, and includes a small working example exercised by its playground and tests.
- Production-ready means build, development, lint, type checking, meaningful unit/e2e tests, `publint`, correct npm metadata, and root CI coverage. Automated release/version orchestration is not included.
- The default completion flow refuses an existing destination, renders and validates the package, runs `pnpm install`, formats generated files, and prints development/test next steps without running the full suite.
- Future sessions should consult the repository domain glossary, the Nuxt module guidance present on `module-template`, current official Nuxt/UnJS primary sources, and the `research`, `prototype`, `grilling`, and `domain-modeling` skills as appropriate.

## Decisions so far

- [Establish the current Nuxt 4 module baseline](issues/01-research-current-nuxt-4-module-baseline.md) — Follow the official Nuxt module starter on Nuxt `>=4.0.0`, adapted to this monorepo; retain the proven module/runtime/playground shape while updating dependencies and removing branch-specific Playwright, coverage, manual tsconfig, formatting, and release extras.
- [Choose the current Nuxt and UnJS scaffolding toolkit](issues/02-research-current-nuxt-unjs-scaffolding-toolkit.md) — Use Citty, direct Clack prompts, Scule, Pathe/native filesystem APIs, pkg-types, narrowly scoped Magicast, and nypm, with Consola/tinyexec reserved for needs the first version does not have.
- [Prototype the interactive scaffolding contract](issues/03-prototype-the-interactive-contract.md) — Use an approved, no-write-before-confirmation flow with inline name/collision validation, an explicit review, staged progress, retained output after post-creation failures, and exact recovery/next-step commands.
- [Design the registry, rendering, and transaction boundaries](issues/04-design-the-registry-rendering-and-transaction-boundaries.md) — Put the interactive and transactional lifecycle behind one deep Scaffolder interface; template definitions produce confined declarative plans, while commit, cleanup, post-commit recovery, and exit policy remain centralized.
- [Specify the generated module and repository contract](issues/05-specify-the-generated-module-and-repository-contract.md) — Generate a working, documented Nuxt 4 module with deterministic naming, focused package handoff TODOs, Node 26 metadata, an SSR-tested starter injection, and one-time shared workspace/Turbo/CI support.
- [Define verification and acceptance](issues/06-define-verification-and-acceptance.md) — Gate every change with focused contract, UX, real-filesystem safety, and disposable real-install fixture tests, plus a three-scenario one-time terminal handoff on Node 26.

## Not yet specified

## Out of scope

- Implementing the scaffolder or generated template during this Wayfinder effort.
- Non-interactive flags or automation mode in version one.
- Template kinds other than Nuxt module in version one.
- Arbitrary npm scopes or unscoped packages.
- Redesigning multi-package release/version/publishing automation.
- Wholesale merging of `module-template` or adopting its unrelated tooling and skill changes.
