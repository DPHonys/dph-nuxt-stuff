# Low-ceremony independent package publishing

Status: ready-for-agent

## Problem Statement

The repository can create self-contained Nuxt packages, but it cannot yet release them independently. Its current release command runs Changelogen from the private root project, assumes one repository-wide release history, creates Git tags, pushes from the release process, and authenticates npm publication with a long-lived token. That model does not fit unrelated packages that should advance only when their own consumer-visible behavior changes.

A newly generated package also needs a deliberate path from safe workspace development to public npm publication. It must not become publishable while it still contains Starter behavior or generated documentation, and neither the root project nor support workspaces may accidentally cross the Publication boundary. Once admitted, maintainers need a small, reviewable process for recording Release intent, producing independent versions and changelogs, publishing from a trusted workflow, recovering from partial publication, and proving that a first release can be installed by a real Nuxt consumer.

The user needs this without adopting a release platform: no synchronized repository version, automated Version Packages PR, custom orchestrator, release-evidence database, or permanent npm write token.

## Solution

Replace the root Changelogen flow with pnpm's native independent release management and one manually dispatched GitHub Actions workflow.

Developers commit a pnpm Release intent with each consumer-visible package change. When a maintainer is ready to release, pnpm previews and consumes every pending intent, independently versions only the affected Publishable packages, propagates Dependency-only releases when required by workspace ranges, writes package changelogs, and produces a maintainer-reviewed Release commit. No global version or Git tag is involved.

Generated packages continue to start at `0.0.1` with `private: true`. Removing `private` is the single admission transition, performed only after Starter behavior and documentation are replaced and the package is reviewed. A repository-level publishing-contract command, included in the Canonical publication gate, enforces that every non-private workspace lies inside the Publication boundary and retains the required Package-local contract.

A maintainer manually dispatches the publish workflow from `main`. The workflow serializes publication, reruns the complete repository check, and recursively publishes missing public package versions through npm trusted publishing with OIDC and provenance. Each new npm package name has one documented local, 2FA-authenticated First-release bootstrap because npm cannot register trust for a package that does not yet exist. After bootstrap, normal publication uses no npm write token.

## User Stories

1. As a package developer, I want to record Release intent with a consumer-visible change, so that versioning and release notes describe why the package must ship.
2. As a package developer, I want one Release intent to name multiple affected packages when appropriate, so that one coherent change can version each consumer contract correctly.
3. As a package developer, I want to choose patch, minor, or major impact explicitly, so that package versions follow semantic versioning rather than commit-message inference.
4. As a package developer, I want internal-only changes to require no no-release declaration, so that maintenance work does not create ceremony without a package release.
5. As a package developer, I want Release intents committed with their changes, so that reviewers can assess version impact and release notes before merging.
6. As a maintainer, I want to inspect the complete pending release plan, so that I know which packages and dependency relationships will change.
7. As a maintainer, I want to preview recursive versioning without modifying the checkout, so that I can catch an incorrect Release intent safely.
8. As a maintainer, I want each Release commit to consume every currently pending intent, so that ordinary releases do not strand an arbitrary filtered subset.
9. As a maintainer, I want unaffected packages to retain their current versions, so that unrelated packages do not appear to have changed.
10. As a maintainer, I want downstream packages bumped only when an internal dependency's new version falls outside their declared workspace range, so that dependency propagation stays minimal and installable.
11. As a maintainer, I want every released package to have its own committed changelog, so that release notes are reviewable in the repository.
12. As a maintainer, I want pnpm's consumed-intent ledger committed with release state, so that an intent cannot be applied twice across branches.
13. As a maintainer, I want to review exact versions, changelogs, and ledger changes before publication, so that the Release commit is the authorization record.
14. As a maintainer, I want to land a Release commit through the repository's normal merge policy, so that publishing does not require a separate automated Release PR.
15. As a maintainer, I want no repository-wide version, root changelog, or global release tag, so that independent package history remains truthful.
16. As a generated-package developer, I want every new package to begin private at `0.0.1`, so that normal workspace development cannot publish unfinished Starter behavior.
17. As a generated-package developer, I want private packages to remain buildable, testable, and usable by their playgrounds, so that admission does not block development.
18. As a package maintainer, I want removal of `private` to be the only package-admission state change, so that readiness is visible in the standard manifest rather than a second registry.
19. As a package maintainer, I want admission to require replacement of Starter behavior and generated documentation, so that a public package does not claim template behavior as a finished product.
20. As a package maintainer, I want admission to retain the Package-local contract, so that the package can build, pack, publish, and resolve its runtime and type entry points.
21. As a repository maintainer, I want only non-private direct children of the package collection to be publishable, so that the root, Scaffolder, playgrounds, fixtures, and nested support workspaces cannot be released.
22. As a repository maintainer, I want the Publication boundary derived from location and manifest state, so that I do not maintain a central package allowlist as packages are added.
23. As a repository maintainer, I want invalid publication metadata reported by the canonical check, so that a malformed package cannot reach the publish workflow.
24. As a repository maintainer, I want publishing-contract diagnostics to identify every violating workspace and invariant, so that one run gives actionable correction guidance.
25. As a repository maintainer, I want private workspaces ignored by the publication validator, so that internal tooling remains free to have a different manifest shape.
26. As a repository maintainer, I want `publint` to remain responsible for packed entry-point correctness, so that the Publication-boundary validator does not duplicate a specialist package check.
27. As a repository maintainer, I want admission review rather than source-text heuristics to verify Starter replacement, so that ordinary prose or implementation choices do not trigger brittle checks.
28. As a release maintainer, I want publication to require an explicit manual workflow dispatch, so that an ordinary merge cannot publish packages accidentally.
29. As a release maintainer, I want the workflow to accept only `main`, so that an unreviewed branch cannot become a publication source.
30. As a release maintainer, I want concurrent publication attempts serialized without cancellation, so that two workflows cannot race to publish the same versions.
31. As a release maintainer, I want the complete canonical repository check rerun against the selected Release commit, so that an older pull-request result is not treated as publication authority.
32. As a release maintainer, I want the workflow limited to read-only repository contents and OIDC token minting, so that publication does not need repository write access.
33. As a release maintainer, I want npm to authenticate the exact repository workflow using OIDC, so that there is no long-lived automation credential to rotate or leak.
34. As a package consumer, I want npm provenance on ordinary publications, so that a published package is linked to its trusted build workflow.
35. As a release maintainer, I want recursive publication to skip private workspaces and package versions already present in npm, so that rerunning the same release is safe.
36. As a release maintainer, I want already published versions to remain published if a later package fails, so that the small workflow does not pretend npm publication is atomic.
37. As a release maintainer, I want to rerun the workflow after correcting an operational failure, so that missing versions can finish without republishing successful ones.
38. As a release maintainer, I want a package-content correction to receive fresh Release intent, so that no process attempts to replace an immutable published version.
39. As a release maintainer, I want no automatic rollback or release-evidence reconciliation, so that the release system remains proportional to the repository's needs.
40. As a maintainer admitting a new package, I want to inspect its prospective tarball, so that the first public version contains only intended files.
41. As a maintainer admitting a new package, I want to perform one local publication with interactive authentication and 2FA, so that the npm package name exists before trust registration.
42. As a maintainer admitting a new package, I want its first release to remain the manifest's seeded `0.0.1`, so that admission does not invent an extra version bump.
43. As a maintainer admitting a new package, I want to install the exact published version in a clean Nuxt application, so that first-release readiness includes real registry consumption.
44. As a maintainer admitting a new package, I want to register the exact publish workflow as that package's trusted publisher, so that later releases can use OIDC.
45. As a maintainer admitting a new package, I want to verify a later OIDC publication before disabling traditional tokens, so that the package is not accidentally left without a working publisher.
46. As a security-conscious maintainer, I want traditional token publication disabled after OIDC verification, so that compromised persistent credentials cannot publish the package.
47. As a release maintainer, I want routine releases to rely on previews, the Canonical publication gate, `publint`, and npm's result, so that every release does not require custom post-publication orchestration.
48. As a repository developer, I want one clear development and release runbook, so that `pnpm change`, version preparation, Release commit review, publication, and bootstrap have distinct responsibilities.
49. As a repository maintainer, I want Changelogen and the old tag-triggered token workflow removed, so that there is exactly one authoritative publication path.
50. As an implementation agent, I want focused automated seams and explicit manual boundaries, so that tests remain deterministic and never need real npm publishing credentials.

## Implementation Decisions

- **Release model:** Use pnpm's native Release intent and recursive versioning capabilities already present in the pinned pnpm 11 toolchain. Package versions are independent. No fixed groups, lanes, epics, maximum-bump policy, synchronized version, or additional release dependency is introduced.
- **Versioning configuration:** Store changelogs in the repository. Do not maintain `versioning.ignore` as a package allowlist; the Publication boundary and package privacy own eligibility.
- **Release-intent policy:** A consumer-visible package change carries a patch, minor, or major Release intent and a changelog-quality summary. Internal-only work carries no required `none` intent. Intent files remain compatible with the Changesets format, but the Changesets CLI is not installed.
- **Release batching:** Ordinary Release commits consume all pending intents with unfiltered recursive versioning. A filter is a recovery tool only. pnpm may expand the release plan with Dependency-only releases when a workspace dependency range would become invalid.
- **Release preparation:** A maintainer works from a clean, current base on `main`, inspects `pnpm change status`, runs recursive versioning in dry-run mode, applies recursive versioning, and runs the canonical repository check. The maintainer reviews every changed package manifest, package changelog, and consumed-intent ledger before committing.
- **Release authorization:** The complete reviewed version/changelog/ledger result is the Release commit. It must reach `main` through normal repository policy before publication. A dedicated Release PR, generated commit, Git tag, or GitHub Release is not required.
- **First release:** A package that is absent from npm releases the exact version already in its manifest. A generated package therefore debuts at `0.0.1`; its admission intent supplies release notes but does not increment that initial version.
- **Package admission:** Every Generated package starts with `private: true`. A maintainer removes it only after replacing Starter behavior and package documentation, reviewing identity and metadata, checking the packed contents, and committing the first Release intent. There is no second readiness file, status service, or admission workflow.
- **Publication boundary:** Only non-private workspace projects that are direct children of the repository's package collection may be versioned and published. The root, Scaffolder, playgrounds, consumer fixtures, nested support projects, and all other workspaces must remain private.
- **Publishing-contract interface:** Add one repository-level command that receives a repository root, discovers workspace manifests, validates the Publication boundary and admitted-package metadata, prints actionable diagnostics, and exits nonzero on any violation. The command is part of the canonical repository check and reports all discovered violations in one run.
- **Admitted-package metadata:** Every Publishable package has an `@dphonys` scoped name, valid semantic version, license, Node engine, canonical repository identity, repository directory matching its workspace location, distribution-only packaged files, runtime and type entry points, public exports, public scoped-package access, and a prepack build. Existing package specialists continue validating detailed export and tarball correctness.
- **Private workspace behavior:** The publishing-contract command does not require internal workspaces to imitate a public package manifest. The existing Scaffolder contract separately ensures that a Generated package carries its future publication metadata while still private.
- **Readiness boundary:** Automated checks do not search source or documentation for Starter text or Handoff markers. Admission review owns the semantic decision that Starter behavior and generated documentation have been replaced.
- **Canonical publication gate:** The existing complete `pnpm check` remains the sole automated pre-publication gate. It includes the publishing-contract command and continues to run type checking, formatting, linting, tests, builds, and `publint` in the established order.
- **Workflow identity:** Replace the current release workflow with one workflow named `publish.yml`. This exact filename is part of each npm trusted-publisher registration and must remain stable unless every package trust configuration is migrated.
- **Workflow trigger:** Publication is manual-only. The workflow rejects any selected ref other than `main`; it does not publish on a push, tag, pull request, schedule, or reusable workflow call.
- **Workflow concurrency:** All publish runs share one non-cancelling concurrency group. A second run waits rather than cancelling a release that may already have published some versions.
- **Workflow authority:** Use a GitHub-hosted Ubuntu runner with only read access to repository contents and permission to request an OIDC identity token. Do not grant repository write access and do not bind the job to a GitHub Environment. Any trusted repository writer who can dispatch Actions is therefore an authorized release maintainer.
- **Workflow preparation:** Check out the selected Release commit, install the repository-pinned pnpm and Node 26, configure the public npm registry, install with the frozen lockfile, and run the complete Canonical publication gate.
- **Publication command:** Recursively publish all missing non-private workspace versions as public packages with provenance. Disable pnpm's own Git checks in CI because the workflow's explicit `main` guard and clean detached checkout supply that invariant.
- **Authentication:** The normal workflow has no npm token. npm authenticates the GitHub-hosted job through OIDC against the repository and exact workflow filename. Provenance remains enabled for public packages from the public repository.
- **Partial publication:** Publication is non-atomic. Successful versions remain immutable when a later package fails. Operational corrections are followed by a rerun, which skips existing registry versions. Content corrections receive new Release intent and versioning. No rollback, manifest handoff, evidence ledger, or reconciliation job is added.
- **Bootstrap preconditions:** First-release bootstrap starts only after package admission and its Release commit have reached `main`. The maintainer reruns the Canonical publication gate and inspects the package tarball in dry-run mode from a clean checkout.
- **Bootstrap publication:** Publish only the new package locally with interactive npm authentication and account 2FA. Do not add a bootstrap token, secret, or token-capable branch to the normal workflow.
- **Bootstrap consumer proof:** Install the exact newly published version into a clean Nuxt application, register the module, and confirm Nuxt preparation and production build succeed. This is a First-release bootstrap check, not recurring workflow automation.
- **Trusted-publisher registration:** Use npm 11.15 or newer to register GitHub Actions trust for the package, repository, exact `publish.yml` filename, and direct publish permission. Do not grant staged-publish permission or configure a GitHub Environment.
- **Post-bootstrap security:** Verify OIDC during the next ordinary package publication. Then require 2FA and disallow traditional token publication for that package, and remove unneeded local publishing credentials.
- **Maintainer documentation:** Document the developer Release-intent flow, all-intent release preparation, Release commit review, manual workflow dispatch, partial-failure retry policy, and per-package First-release bootstrap as separate procedures with explicit preconditions and expected results.
- **Migration:** Remove the Changelogen development dependency, root release command, tag-triggered release behavior, npm token use, repository write permission, and tag/GitHub Release behavior. Add pnpm versioning configuration, the publishing-contract command, the manual OIDC workflow, release/bootstrap documentation, tests, and corresponding lockfile state.
- **Migration safety:** Existing private workspaces stay private. No package is admitted as a side effect of installing the publishing system, and implementation does not perform a real publication.

## Testing Decisions

- **Primary seam:** Test the repository-level publishing-contract command at its process boundary. Give it disposable repository roots containing real workspace manifests and assert exit status plus human-facing diagnostics. Do not expose lower-level parsing or validation helpers solely for tests.
- **Good-test standard:** Assert observable repository policy: which workspaces are accepted, which invariant is rejected, and what a maintainer is told. Avoid tests coupled to helper calls, traversal order, or internal data structures. Normalize only genuinely nondeterministic path details.
- **Valid boundary case:** A repository with private support workspaces and one correctly admitted direct package passes. The same Generated package while private also leaves the repository valid.
- **Location rejection matrix:** Reject a non-private root, Scaffolder, playground, consumer fixture, nested workspace, and any public workspace outside a direct package child. Diagnostics identify the offending workspace and the Publication-boundary rule.
- **Metadata rejection matrix:** For an admitted direct package, independently reject an invalid or unexpected package name, invalid version, missing license or engine, wrong repository identity, mismatched repository directory, missing packaged-file declaration, missing runtime/type entry points or exports, non-public access, and missing prepack build.
- **Diagnostic behavior:** When several workspaces or metadata rules fail, report all violations and return one nonzero result. A valid run is quiet or emits one concise success result and returns zero.
- **Scaffolder prior art:** Extend the existing Nuxt-module Template and disposable Acceptance-fixture assertions only as needed to preserve `private: true`, seeded `0.0.1`, and the full future publication metadata. Do not create a second generated golden package.
- **Release integration seam:** Exercise the actual pinned pnpm CLI in disposable Git repositories against a deterministic local registry stub. This is the authoritative test for Release intents, dry-run planning, first-release registry detection, recursive versioning, changelog storage, ledger updates, and workspace dependency propagation.
- **Independent release scenario:** With two unrelated Publishable packages, intent for one changes only that package's plan, version, changelog, and ledger entry; the other package remains untouched.
- **Dependency propagation scenarios:** A compatible workspace dependency range leaves the downstream package unchanged. A range invalidated by the upstream release adds exactly one downstream patch Dependency-only release and updates the packed dependency range as pnpm specifies.
- **First-release scenario:** A package absent from the local registry retains seeded version `0.0.1` during its initial plan and versioning run while still producing the expected changelog and ledger state.
- **All-intent scenario:** Multiple pending intents are shown together by status and consumed by one unfiltered recursive versioning run. Dry-run leaves the checkout unchanged; the real disposable run writes the approved versions, changelogs, and ledger without creating a Git commit or tag.
- **Workflow contract:** Parse the workflow as configuration and assert manual-only triggering, the `main` guard, non-cancelling serialization, GitHub-hosted execution, exact least-privilege permissions, frozen installation, the Canonical publication gate, recursive public OIDC publication with provenance, and disabled pnpm Git checks.
- **Workflow exclusions:** Assert absence of npm write-token references, repository write permissions, GitHub Environment binding, tag triggers, tag creation, GitHub Release creation, automatic versioning, and publication before the canonical check.
- **No live publication tests:** Automated tests never create an npm package, mutate npm trust, request real OIDC credentials, publish a version, or depend on maintainer credentials. Those behaviors are covered by primary-source configuration contracts and the documented bootstrap checklist.
- **Manual bootstrap acceptance:** For the first real admitted package, a maintainer records the inspected tarball, successful local first publication, exact-version clean Nuxt prepare/build, trusted-publisher registration, first successful OIDC publication, and token restriction. This is a one-time operator checklist per package, not a CI suite.
- **Root enforcement:** The publishing-contract tests, release integration tests, and workflow-contract test run through the existing Turbo test aggregation and remain mandatory in `pnpm check` on pull requests and before publication.
- **Prior art:** Follow the existing disposable Acceptance fixture's real-temporary-repository style, production adapters, deterministic cleanup, and observable assertions. Reuse its repository setup patterns where they fit, but keep publishing policy behind the repository-level command rather than coupling it to the Scaffolder module.

## Out of Scope

- Implementing or publishing a particular package as part of installing this release system.
- Changesets CLI, release-it, semantic-release, Changelogen, or a custom release orchestrator.
- An automated Version Packages PR, release bot, or mandatory no-release declarations.
- Filtering ordinary Release commits to selected pending intents.
- Fixed or synchronized package versions, a repository version, root changelog, or global release tag.
- Package-qualified Git tags, per-package GitHub Releases, release notes hosted outside package changelogs, or GitHub content writes.
- Formal npm prerelease lanes or `next`, `beta`, and `rc` distribution policy.
- GitHub Environment approvals, staged npm publication, or a second approval after manual dispatch.
- Long-lived npm write tokens, bootstrap workflow secrets, or routine publication from developer machines.
- Automatic rollback, atomic multi-package publication, tarball handoff manifests, release-evidence reconciliation, or post-publication repair jobs.
- Automated exact-version consumer smoke tests after every ordinary release.
- Publishing the root, Scaffolder, Templates, playgrounds, fixtures, nested support workspaces, or any private workspace.
- Automatically deciding whether Starter behavior or generated documentation has been sufficiently replaced.
- Designing individual package APIs, product behavior, release cadence, or the maturity threshold for `1.0.0`.
- Supporting private npm packages, private registries, private runtime dependencies, or repositories that cannot emit public provenance.
- Changing the existing pull-request `pkg-pr-new` preview flow.

## Further Notes

- The canonical decision history remains indexed by the [Wayfinder map](map.md). Detailed answers live in [Establish the low-ceremony publishing fit](issues/00-establish-the-low-ceremony-publishing-fit.md), [Define first-release readiness](issues/01-define-first-release-readiness.md), and [Specify the repository release contract](issues/02-specify-the-repository-release-contract.md).
- Primary-source research and the tool comparison are captured in [Current pnpm-native package publishing](research/current-pnpm-native-package-publishing.md).
- Use the repository glossary's terms—Generated package, Starter behavior, Repository support, Package-local contract, Independent package release, Publishable package, Publication boundary, Release intent, Dependency-only release, Release commit, Canonical publication gate, and First-release bootstrap—throughout implementation and follow-up tickets.
- pnpm's native release capability is intentionally the least mature dependency in this plan. Keep the pinned pnpm version and the release integration suite aligned when Renovate or a maintainer upgrades pnpm.
- The trusted-publisher workflow filename is external npm configuration. Renaming it later is a migration across every published package, not a cosmetic repository change.
- This specification is implementation-ready but deliberately contains no delivery slices. The next flow is `/to-tickets`, which should split it into blockers-first tracer bullets without re-triaging the resulting tickets.
