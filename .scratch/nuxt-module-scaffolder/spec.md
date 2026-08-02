# Repository-owned Nuxt module scaffolder

Status: ready-for-agent

## Problem Statement

The repository has no safe, repeatable way to create a new Nuxt module package. A developer must currently assemble package structure, metadata, naming, Nuxt wiring, workspace integration, tests, documentation, and verification by hand or copy them from an older branch whose product behavior and tooling no longer match the repository.

That manual process makes it easy to create a package that looks plausible but is not actually production-ready: identifiers can drift, runtime behavior can be untested, nested workspaces can go undiscovered, publishing metadata can be wrong, and the root CI gate can omit module-specific checks. Copying also creates safety risks when a destination exists or a generation step fails halfway through.

The user needs one repository-owned Scaffolder that creates a consistent Nuxt 4 generated package from the repository root, proves the generated package works, refuses destructive behavior, and leaves precise recovery guidance when post-creation work fails.

## Solution

Add an interactive `pnpm scaffold` command backed by one deep Scaffolder module and an extensible registry of repository-owned Template kinds. Version one exposes one visible, preselected Template kind: Nuxt module.

The Scaffolder asks once for a canonical Scaffold name and optional description, shows every derived identity for review, and requires explicit confirmation before writing. It renders and validates in an owned same-filesystem staging area, atomically commits a complete generated package, installs workspace dependencies at the repository root, formats only the generated package, and prints exact next steps.

The generated package is a working Nuxt 4 module rather than an inert skeleton. It includes typed Starter behavior, a playground, a real consumer-fixture SSR test, truthful documentation, publishing metadata, and package-local commands. Shared Repository support makes pnpm, Turbo, TypeScript, formatting, linting, CI, release checks, and `publint` discover and verify generated packages.

All recurring acceptance is automated through the canonical `pnpm check` gate. The primary test seam is the deep Scaffolder interface; real temporary repositories exercise transaction safety, and one disposable Acceptance fixture proves the production Template and Repository support together.

## User Stories

1. As a repository developer, I want to start the Scaffolder with `pnpm scaffold`, so that I do not need to remember an internal script location or tool-specific invocation.
2. As a repository developer, I want the command to identify itself as scaffolding a workspace package, so that its purpose is immediately clear.
3. As a repository developer, I want to see Nuxt module as the selected Template kind, so that I understand what will be created and the workflow can later support additional kinds without changing its shape.
4. As a repository developer, I want to provide one Scaffold name, so that package, module, configuration, injection, fixture, playground, and display identities cannot drift apart.
5. As a repository developer, I want invalid names rejected inline, so that I can correct them without restarting the command.
6. As a repository developer, I want names validated rather than silently normalized, so that the generated identity is exactly the one I approved.
7. As a repository developer, I want the name to start with a lowercase letter and contain only lowercase letters, numbers, and single hyphens, so that it is safe and canonical across package, filesystem, and TypeScript contexts.
8. As a repository developer, I want names limited to 80 characters, so that generated identifiers and paths stay manageable.
9. As a repository developer, I want an existing destination reported at the name prompt, so that I can choose another name before confirmation.
10. As a repository developer, I want to supply an optional description, so that generated metadata and documentation can start with truthful package-specific context.
11. As a repository developer, I want surrounding description whitespace removed and a blank description treated as absent, so that the Scaffolder does not invent copy or emit empty metadata.
12. As a repository developer, I want a review of the Template kind, destination, published package name, Nuxt module name, configuration key, display name, and description, so that I can catch mistakes before anything changes.
13. As a repository developer, I want confirmation to default to No, so that an accidental Enter cannot create a package.
14. As a repository developer, I want declining or cancelling before confirmation to leave the repository unchanged, so that exploring the workflow is safe.
15. As a repository developer, I want generation to remain invisible at the destination until rendering and validation finish, so that consumers never see a partial package.
16. As a repository developer, I want lifecycle progress shown in a stable order, so that I know whether the Scaffolder is rendering, installing, or formatting.
17. As a repository developer, I want success output to identify the created package and destination, so that I can verify the result at a glance.
18. As a generated-package developer, I want success output to include exact development and test commands, so that I can begin working immediately.
19. As a generated-package developer, I want success output to say that full verification was not run, so that formatting and installation are not mistaken for the complete quality gate.
20. As a repository developer, I want an installation failure to retain the valid generated package and print exact recovery commands, so that completed generation work is not destroyed.
21. As a repository developer, I want a formatting failure to retain the installed generated package and print exact recovery and test commands, so that I can resume from the correct lifecycle stage.
22. As a repository developer, I want interruption after commit to retain the generated package and conservatively prescribe installation and formatting, so that uncertain post-commit state is recoverable.
23. As a repository developer, I want operational failures and signal interruptions to return meaningful process exit codes, so that shells and automation can distinguish outcomes.
24. As a repository developer, I want the Scaffolder never to call `process.exit()` internally, so that cleanup, tests, and embedding are reliable.
25. As a repository developer, I want existing directories, regular files, and symlinks at the destination preserved, so that scaffolding never overwrites or follows unrelated content.
26. As a repository developer, I want same-name Scaffolder invocations coordinated, so that only one can own the destination transaction.
27. As a repository developer, I want failures before commit to remove only artifacts owned by that invocation, so that cleanup cannot damage unrelated repository content.
28. As a repository developer, I want cleanup failures to report the original error and exact retained artifact, so that manual recovery is precise.
29. As a Template author, I want Template definitions to declare identity, source, expected files, tokens, and a preparation plan, so that a second repository-local kind can reuse the same workflow.
30. As a Template author, I want powerful filesystem and mutation operations owned by the Scaffolder rather than arbitrary Template hooks, so that Template extension cannot bypass transaction safety.
31. As a Template author, I want structured JSON and TypeScript edited by structure-aware tools, so that rendering does not corrupt configuration or source syntax.
32. As a Template author, I want unexpected TypeScript structure to fail validation in staging, so that the Scaffolder never falls back to unsafe textual rewriting.
33. As a generated-package developer, I want a standard Nuxt module source and runtime plugin, so that I begin from current Nuxt module-authoring conventions.
34. As a generated-package developer, I want a typed optional message setting as neutral Starter behavior, so that the package proves option flow without pretending to implement product functionality.
35. As a generated-package developer, I want the default message available through a name-prefixed runtime injection, so that generated names and Nuxt runtime registration are demonstrably correct.
36. As a generated-package developer, I want a playground that renders the display name and default Starter behavior, so that I can inspect and replace package behavior interactively.
37. As a generated-package developer, I want a real consumer fixture that overrides the message and asserts SSR output, so that module setup, runtime plugin registration, configuration, injection naming, and rendering are protected.
38. As a generated-package developer, I want exactly three Handoff markers at the true customization points, so that I know what to replace without mistaking the package for incomplete scaffolding.
39. As a generated-package developer, I want truthful rendered documentation, so that installation, registration, options, injection use, development, and licensing are usable from the first commit.
40. As a package publisher, I want correct ESM exports, types, public scoped-package metadata, repository metadata, and packaged files, so that a built package is ready for `publint` and eventual npm publication.
41. As a package publisher, I want the generated package to begin at version `0.0.1` with an MIT license and Node 26 engine requirement, so that its initial publication contract is explicit.
42. As a repository maintainer, I want generated dependencies to use the shared pnpm catalog, so that Renovate and root policy own dependency versions.
43. As a repository maintainer, I want nested playgrounds discovered as workspaces while consumer test fixtures remain private test data, so that installs and Turbo tasks operate at the intended boundaries.
44. As a repository maintainer, I want root TypeScript checking to defer Nuxt-aware package checks to each package, so that virtual Nuxt aliases are resolved in the correct context without weakening root strictness.
45. As a repository maintainer, I want Turbo to aggregate generated-package tests, builds, type checks, linting, and `publint`, so that adding a package automatically expands repository verification.
46. As a repository maintainer, I want CI and release to run the same complete Node 26 gate, so that preview, merge, and publication paths cannot disagree about readiness.
47. As a repository maintainer, I want preview publication to depend on the full check, so that broken generated packages are not published as previews.
48. As a repository maintainer, I want generated Nuxt artifacts ignored at every repository depth, so that development and verification do not pollute version control.
49. As a repository maintainer, I want one deterministic Acceptance fixture created in a disposable repository, so that the production Template is proven without committing a second golden copy.
50. As a repository maintainer, I want the Acceptance fixture to perform a real install, formatting check, lint, typecheck, SSR test, package build, playground build, and `publint`, so that the package-local contract and Repository support are executable together.
51. As a repository maintainer, I want all automated acceptance on every pull request and release, so that strong checks cannot quietly go stale behind an optional command.
52. As a maintainer handing off the implementation, I want a small real-terminal checklist, so that Clack rendering and keyboard behavior are confirmed without brittle ANSI snapshots.

## Implementation Decisions

- **Product boundary:** Version one is a repository-local, interactive-only Scaffolder invoked as `pnpm scaffold`. It creates one Template kind, Nuxt module, under the repository's package collection. The visible Template selection remains even with one option because the internal registry is an intentional extension point.
- **Prompt contract:** The flow opens with `Scaffold a workspace package`, then asks for Template kind, Scaffold name, optional description, review, and `Create this package? (y/N)`. Confirmation defaults to No. All prompts, including confirmation, complete before the first write.
- **Name validation:** Empty input reports `Enter a scaffold name.` Input beyond 80 characters reports `Use 80 characters or fewer.` Noncanonical input reports `Use lowercase letters, numbers, and single hyphens; start with a letter (for example, image-tools).` A collision reports `packages/<name> already exists. Choose a different scaffold name.` Validation does not normalize user input.
- **Deterministic naming:** One frozen naming context derives every identity. For `api-2-client`, the package is `@dphonys/api-2-client`, the Nuxt module name is `api-2-client`, the configuration key is `api2Client`, the runtime injection is `$api2Client`, the display name is `Api 2 Client`, and the default message is `Hello from Api 2 Client`. Playground and fixture package identities add the agreed playground and test-fixture suffixes.
- **Review contract:** The review lists Template kind, destination, published package, Nuxt module name, configuration key, display name, and the trimmed description or `(none)`.
- **Cancellation contract:** Declining or cancelling before confirmation prints `Scaffolding cancelled. No files were changed.` and exits successfully. No filesystem, install, or format operation occurs.
- **Progress contract:** Confirmed creation shows `Rendering and validating package`, `Installing workspace dependencies with pnpm`, and `Formatting packages/<name>` in that order.
- **Success contract:** Success states `Created @dphonys/<name> at packages/<name>.`, prints repository-root development and test commands filtered to the new package, and ends with `Full verification was not run.`
- **Recovery contract:** Installation failure says the generated package was created and retained, then prescribes root installation followed by destination-scoped Oxfmt. Formatting failure says dependencies are installed and the package is retained, then prescribes destination-scoped Oxfmt followed by the filtered package test. Post-commit interruption prescribes installation then formatting.
- **Deep interface:** The production Scaffolder exposes one high-level operation accepting the repository root and an optional abort signal and returning a discriminated Scaffold outcome. The Citty shell calls it, renders the outcome, and assigns `process.exitCode`; it contains no prompting, naming, registry, rendering, transaction, cleanup, installation, formatting, or recovery policy.
- **Internal composition:** The Scaffolder composes a Clack interaction adapter, a static Template registry, operation adapters, a repository-root installer, and a destination-scoped formatter. Tests may use a private composition factory with scripted interaction and fake post-commit effects, but no additional public test seams are introduced.
- **Outcome model:** Outcomes distinguish created, declined or cancelled, collision, generation failure, cleanup failure, install failure, format failure, and interruption before or after commit. Success, decline, and pre-confirmation cancellation exit `0`; operational failures exit `1`; signal interruption after confirmation exits `130`.
- **Toolkit:** Citty owns the command shell; direct Clack prompts own interaction and logging; Scule owns naming transforms; Pathe owns normalized path calculations; native promise-based filesystem APIs own copying, directories, rename, and cleanup; pkg-types owns JSON-shaped metadata; Magicast owns narrowly defined TypeScript mutations; nypm detects and runs the repository-root pnpm install. Consola, Giget, package-local copying utilities, and a custom process controller are unnecessary in version one.
- **Template registry:** Each pure Template definition declares a kind id and label, a repository-relative Template source, required output, allowed text tokens, and a pure preparation function. Preparation derives the frozen naming context and returns an immutable, path-confined render and validation plan.
- **Plan vocabulary:** Plans may copy the Template tree, replace allowlisted tokens in explicitly declared plain-text files, write JSON-shaped metadata, apply a named Magicast recipe to a known TypeScript shape, and run declarative required-file, unresolved-token, metadata, and Template-specific validations. There are no arbitrary imperative Template hooks.
- **Mutation boundaries:** Plain tokens are for prose and other unstructured text only. pkg-types owns manifests and TypeScript configuration. Magicast initially updates the known static `defineNuxtModule` metadata shape and fails on unexpected structure. Regex fallback is forbidden.
- **Transaction:** After confirmation, the Scaffolder rechecks the destination, exclusively acquires a destination-specific cooperative lock, creates a unique same-filesystem staging sibling, copies and renders the Template, validates entirely in staging, rechecks the destination, and renames staging into place. The rename is the commit point. It then releases the lock, runs the repository-root install, and formats only the generated package.
- **Non-overwrite guarantee:** The Scaffolder never deliberately overwrites, merges with, follows, or removes an existing destination. The cooperative lock coordinates Scaffolder processes targeting the same name. An unrelated writer that ignores the lock during the final check-and-rename interval is outside the portable guarantee.
- **Cleanup boundary:** Before commit, failure or interruption removes only the exact staging and lock artifacts owned by that invocation. Cleanup never accepts a caller-supplied path, glob, discovered directory, generated-package destination, or repository root. Cleanup failure retains the exact artifact and reports it with the original error and manual-removal guidance.
- **Post-commit boundary:** Rollback is forbidden after commit. Lock-release, install, format, or interruption failures retain the generated package and report the correct recovery path. Formatting does not run after an install failure.
- **Generated package contents:** Every generated package contains an MIT license, truthful README, publishable manifest, Nuxt-aware TypeScript configuration, a module entry, a runtime plugin, a playground app with its Nuxt configuration and private manifest, and one basic Vitest test with a private consumer fixture. No package-local lint, format, or Vitest configuration is generated.
- **Excluded generated content:** Do not generate Playwright or coverage scaffolding, handwritten server TypeScript configurations, changelogs, release scripts, nested workspace declarations, nested lockfiles, package-local ignore files, or branch-specific product behavior.
- **Publication metadata:** The generated manifest starts at version `0.0.1`, is ESM, is MIT licensed, requires Node `>=26.0.0`, and includes the fixed `@dphonys` package name, optional trimmed description, Nuxt keywords, monorepo repository metadata, Module Builder exports and type mappings, distribution-only packaged files, and public scoped-package publication access. It is not private and declares no package-level workspace.
- **License:** The generated license is the standard MIT text with `Copyright (c) <injected year> Daniel Petr Honys`. The year comes from an injected clock.
- **Nuxt contract:** The module exports the conventional typed options interface with one optional `message`. Object-form `defineNuxtModule` declares the generated module name, generated configuration key, compatibility `>=4.0.0`, and default message. Setup writes the resolved message to public runtime configuration under the generated key and registers the runtime plugin.
- **Starter behavior:** The runtime plugin reads the name-prefixed public runtime configuration and provides an object containing `message` through the generated injection. This neutral behavior exists to prove the package works and is intended to be replaced.
- **Playground:** The private playground consumes the published workspace package, leaves the message at its default, enables Nuxt DevTools, uses the latest compatibility date, and renders the display name and injected default message.
- **Consumer fixture:** The private fixture imports the module source directly, configures a distinct message through the generated configuration key, and renders the generated injection's message. The package test starts it with Nuxt Test Utils, fetches the root page, and asserts the exact override through SSR.
- **Handoff markers:** Generate exactly three: one at the module option/setup customization point, one at the runtime behavior customization point, and one short README callout. Do not add Handoff markers to the playground or test.
- **README:** Documentation includes rendered title and optional description, pnpm installation, Nuxt registration and configuration, option and injection usage, an options table, repository-local development commands, and MIT licensing. It excludes fabricated features, unpublished badges, release notes, external playground/documentation links, and publishing instructions.
- **Package commands:** The generated package provides Module Builder distribution build and prepack, prepared playground development, playground production build, stub and Nuxt preparation, inherited ESLint, Nuxt-aware source and playground type checking, Vitest run/watch, and `publint`. Type checking self-prepares so it works after a fresh install.
- **TypeScript layering:** Package TypeScript configuration extends generated Nuxt aliases and then the repository's strict base while excluding the independently checked playground. The playground extends its generated Nuxt configuration. Root plain TypeScript checking excludes generated packages; Turbo invokes each package's Nuxt-aware check.
- **Dependencies:** `@nuxt/kit` is the sole runtime dependency. Development dependencies are Nuxt DevTools, Module Builder, Nuxt schema and Test Utils, Node types, Nuxt, `publint`, TypeScript, Vitest, and Vue TSC. Generated manifests reference shared catalog entries. The initial catalog baselines are `@nuxt/kit` `^4.5.1`, `@nuxt/devtools` `^3.3.1`, `@nuxt/module-builder` `^1.0.3`, `@nuxt/schema` `^4.5.1`, `@nuxt/test-utils` `^4.1.0`, `@types/node` `latest`, Nuxt `^4.5.1`, `publint` `^0.3.22`, Vitest `^4.1.10`, and Vue TSC `^3.3.8`. TypeScript retains the repository's exact native-bridge identity instead of introducing a second version.
- **Workspace support:** Keep top-level package discovery and add nested playground discovery. Consumer fixtures are not workspaces. A normal scaffolding run creates only its generated package; it does not repeatedly rewrite shared Repository support. The subsequent root install updates the workspace lockfile.
- **Turbo support:** Preserve existing tasks, add test and `publint` aggregation, require build before `publint`, and recognize both package distribution and Nuxt application build outputs.
- **Root commands:** Root type checking combines the plain root compiler with Turbo package type checks. Root tests run the focused Scaffolder Vitest suite once and then Turbo package tests. Root `publint` delegates through Turbo. The canonical check runs type checking, format checking, linting, tests, builds, and `publint` in that order.
- **CI and release:** The focused existing CI shape remains. Its check job uses Node 26 and the canonical root gate; preview publication depends on it. Release runs the same full gate before the existing release operation. This feature does not redesign versioning or publication.
- **Ignore policy:** Shared ignore rules cover Nuxt, Nitro, and Nuxt output directories at every depth. Obsolete Playwright and coverage patterns are not added.
- **Authoring documentation:** Version one needs no separate Template-authoring guide. The internal types, invariants, and Nuxt-module definition are the authoring contract until a second real Template kind creates evidence for additional documentation.

## Testing Decisions

- **Primary seam:** Test the highest stable boundary: the deep Scaffolder operation and its observable outcome, interaction events, filesystem result, adapter calls, messages, and exit policy. This seam was approved in the registry/transaction prototype and reconfirmed while defining acceptance.
- **Limited lower seams:** Test pure naming, plan preparation, named renderer recipes, and declarative validators directly because their exhaustive invariant partitions would be cumbersome and less diagnostic through a full interactive transaction. Do not test third-party library wrappers for their own sake.
- **Good-test standard:** Prefer observable behavior and real filesystem state over internal call structure. Use fake interaction and post-commit effects only to make decisions and failures deterministic. Never replace the filesystem with a filesystem-shaped mock when testing commit, collision, cleanup, or rename behavior.
- **Naming partitions:** Accept the minimum and 80-character bounds, ordinary multiword names, and embedded digits. Reject empty or whitespace-only input, overlength input, uppercase, spaces, underscores, dots, separators, scoped names, Unicode, repeated or boundary hyphens, and a leading digit. Assert exact validation copy and the complete `api-2-client` derivation set.
- **Rendering contracts:** Test registry lookup, frozen preparation, path confinement, token allowlisting, structured metadata writes, named Magicast mutation, required files, unresolved-token rejection, unexpected-AST rejection, Template-specific validation, trimmed and absent descriptions, and deterministic license year.
- **Interaction tests:** Use a scripted interaction adapter and assert semantic events plus exact approved copy. Cover prompt order, defaults, inline retries, every review row, confirmation-before-write, decline, cancellation, lifecycle step order, success, recovery, outcomes, and exit codes. Do not snapshot Clack ANSI output.
- **Transaction tests:** Use real temporary repositories with recording or failing install and format adapters. Assert destination presence or absence, exact owned-artifact cleanup, post-commit retention, adapter arguments, repository-root working directory, order, and recovery guidance.
- **Collision matrix:** Cover an existing directory, regular file, and symlink; a destination appearing after review; a destination appearing before commit; and deterministic same-name contention by holding the cooperative lock. Preserve unrelated content in every case. Do not introduce timing-sensitive process races.
- **Pre-commit failure matrix:** Inject copy, token, JSON, Magicast, and validation failures. Assert no destination and removal of only the invocation's staging and lock. Inject cleanup failure and assert the original error, retained exact artifact, and manual-removal guidance.
- **Post-commit failure matrix:** Inject lock-release, install, and format failures plus interruption before and after commit. Assert that pre-commit interruption cleans up, post-commit failures retain the package, formatting does not follow failed installation, and each outcome emits its agreed recovery commands and exit code.
- **Acceptance fixture:** On every canonical check, create a deterministic `api-2-client` Acceptance fixture in a disposable repository using production Template, renderers, validators, transaction, installer, and formatter. Supply a padded description and fixed year. Perform a real repository-root `pnpm install --no-frozen-lockfile` so only the disposable lockfile changes.
- **Acceptance fixture structure:** Before install, assert the exact required tree, absence of prohibited files, every derived identity and metadata field, trimmed description, command and dependency roles, Nuxt compatibility, README sections, exactly three Handoff markers, fixed license year, and no known tokens, locks, or staging artifacts. Use targeted structural and semantic assertions rather than full-file snapshots.
- **Acceptance fixture execution:** After real installation and production formatting, run Oxfmt check mode, lint, typecheck, the real Nuxt Test Utils SSR fixture, distribution build, playground build, and `publint`. Verify pnpm and Turbo discover both the generated package and nested playground through Repository support.
- **Nuxt version policy:** Execute the Acceptance fixture against the catalog-pinned current Nuxt 4 release and separately assert the exact `>=4.0.0` module compatibility declaration. Do not add a Nuxt 4.0.0 install matrix.
- **Fixture cleanup:** Always remove the disposable repository in teardown, including after failure. Do not commit a golden generated package.
- **Root enforcement:** All automated checks are mandatory in `pnpm check` on every pull request and before release. There is no optional/nightly suite and no numeric coverage target.
- **Manual terminal acceptance:** At implementation handoff, use a throwaway worktree on Node 26 for three scenarios: correct an invalid name and accept default-No with no changes; complete a real successful creation and run the printed package test; cancel with Ctrl-C during prompting and confirm exit `0` with no changes. Automated tests remain authoritative for induced failures, collision timing, signal timing after confirmation, and cleanup.
- **Prior art:** The approved interactive prototype defines the UX state and exact copy. The approved registry-boundaries prototype defines lifecycle outcomes and the high test seam. The official Nuxt module starter and Nuxt Test Utils consumer-fixture pattern define generated-package integration testing. The current main branch has no package-level test precedent, so unrelated branch-wide Playwright and coverage scaffolding are not adopted.

## Out of Scope

- Non-interactive flags, command arguments for automation, or a headless generation mode.
- Template kinds other than Nuxt module.
- Remote Templates, Template downloads, caches, or Giget integration.
- Arbitrary npm scopes, unscoped packages, or configurable repository metadata.
- Overwriting, merging into, or cleaning an existing destination.
- A portable guarantee against unrelated writers that ignore the cooperative lock during the final check-and-rename interval.
- Product-specific behavior in generated modules.
- Browser-only Playwright scaffolding, coverage tooling, or a numeric coverage threshold.
- Package-local formatting, lint, release, workspace, lockfile, or ignore configuration.
- Automatic full verification at the end of each interactive scaffolding run.
- Automated versioning, changelog, tag, push, release, or npm publication redesign.
- A separate Template-authoring guide before a second real Template kind exists.
- Inline troubleshooting documentation beyond the approved outcome and recovery messages.
- Wholesale merging of the `module-template` branch or adoption of its unrelated tooling and skill changes.

## Further Notes

- The canonical decision history remains indexed by the [Wayfinder map](map.md). Details live in [Establish the current Nuxt 4 module baseline](issues/01-research-current-nuxt-4-module-baseline.md), [Choose the current Nuxt and UnJS scaffolding toolkit](issues/02-research-current-nuxt-unjs-scaffolding-toolkit.md), [Prototype the interactive scaffolding contract](issues/03-prototype-the-interactive-contract.md), [Design the registry, rendering, and transaction boundaries](issues/04-design-the-registry-rendering-and-transaction-boundaries.md), [Specify the generated module and repository contract](issues/05-specify-the-generated-module-and-repository-contract.md), and [Define verification and acceptance](issues/06-define-verification-and-acceptance.md).
- Primary-source research is captured in [Current Nuxt 4 module baseline](research/current-nuxt-4-module-baseline.md) and [Current Nuxt/UnJS scaffolding toolkit](research/current-nuxt-unjs-scaffolding-toolkit.md).
- Use the repository glossary's terms—Scaffolder, Template kind, Template, Generated package, Starter behavior, Repository support, Package-local contract, Handoff marker, Scaffold name, and Acceptance fixture—throughout implementation and follow-up tickets.
- The `module-template` branch is reference material only. Implementation targets the current main architecture.
- Dependency versions are a research snapshot from 2026-08-02. Preserve the approved package roles and current catalog policy; let Renovate own subsequent compatible refreshes.
