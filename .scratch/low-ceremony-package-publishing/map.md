# Wayfinder map: Low-ceremony package publishing

## Destination

An implementation-ready minimal contract for independently versioning and publishing `packages/*` with pnpm's native release management and one GitHub Actions publish workflow. The route is clear when a maintainer can develop, admit, version, publish, and install a package without custom release machinery or unresolved essential decisions.

## Notes

- This effort plans the publishing system; implementation is a separate handoff.
- The repository already pins pnpm 11.18. Its native flow is `pnpm change` → `pnpm version -r` → reviewed Release commit → `pnpm publish -r`.
- A generated package starts at `0.0.1` and `private: true`; removing `private` is its explicit admission to publication.
- Packages advance independently. There is no repository-wide version or automatic promotion to `1.0.0`.
- Only non-private direct children of `packages/*` may publish. The root, Scaffolder, playgrounds, fixtures, and other support workspaces remain private.
- The canonical repository check remains the pre-publication quality gate. Pull requests continue to use disposable `pkg-pr-new` previews.
- Steady-state publication uses GitHub Actions OIDC with provenance and no long-lived npm write token; each new npm package name has one documented bootstrap step.
- Future sessions should consult `CONTEXT.md`, [Current pnpm-native package publishing](research/current-pnpm-native-package-publishing.md), current official npm/pnpm primary sources, and the `grilling` and `domain-modeling` skills.

## Decisions so far

- [Establish the low-ceremony publishing fit](issues/00-establish-the-low-ceremony-publishing-fit.md) — Use pnpm's native independent release flow instead of adding a separate release tool or synchronized package versions.
- [Define first-release readiness](issues/01-define-first-release-readiness.md) — Keep every generated package private until a maintainer deliberately admits it, records its first pnpm change intent, and performs the one-time npm trust bootstrap.
- [Specify the repository release contract](issues/02-specify-the-repository-release-contract.md) — Use all-intent Release commits, a checked Publication boundary, and a manual main-only OIDC workflow, with one local bootstrap per new npm package.

## Not yet specified

## Out of scope

- Implementing the publishing system during this Wayfinder effort.
- Changesets CLI, release-it, semantic-release, or a custom release orchestrator.
- An automated Version Packages PR or mandatory no-release declarations.
- Package-qualified Git tags, per-package GitHub Releases, artifact handoff manifests, and release-evidence reconciliation.
- A synchronized repository-wide version, root changelog, or global `v*` release tag.
- Formal npm prerelease channels such as `next`, `beta`, or `rc`.
- Publishing from developer machines after the one-time first-release bootstrap.
- Publishing the root, Scaffolder, templates, playgrounds, fixtures, or any private workspace package.
- Designing package APIs or deciding when a package is mature enough for `1.0.0`.
