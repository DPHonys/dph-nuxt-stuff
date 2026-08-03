# Specify the repository release contract

Type: grilling
Status: resolved
Assignee: codex
Blocked by: [Establish the low-ceremony publishing fit](00-establish-the-low-ceremony-publishing-fit.md), [Define first-release readiness](01-define-first-release-readiness.md)

## Question

What exact pnpm versioning configuration, package metadata, maintainer commands, GitHub publish workflow, one-time npm bootstrap instructions, migration steps, and focused acceptance checks form the smallest implementation-ready replacement for the current root Changelogen flow?

## Answer

Replace the root Changelogen release with pnpm's native independent release flow and one manually dispatched `.github/workflows/publish.yml`. The implementation contract is the following.

### Versioning configuration

Add only repository-stored package changelogs to `pnpm-workspace.yaml`:

```yaml
versioning:
  changelog:
    storage: repository
```

Do not configure fixed groups, lanes, epics, or a maximum bump. Do not maintain a central `versioning.ignore` allowlist: package eligibility is derived from the Publication boundary, and every support workspace remains private.

Consumer-visible package changes commit a `pnpm change` Release intent alongside the change. Internal-only changes need no `none` intent. A Release commit consumes every pending intent together; `--filter` is reserved for recovery, not ordinary releases. pnpm's dependency propagation may add a Dependency-only release when an internal workspace range would otherwise be invalid.

### Package contract and admission

A generated package remains a direct child of `packages/*`, starts at `0.0.1`, and keeps `private: true`. Removing `private` is the only admission state. Before doing so, a maintainer replaces the Starter behavior and generated documentation, reviews the packed contents, and records the first Release intent.

Every non-private workspace must be a direct child of `packages/*` and retain the Template's publication metadata contract:

- an `@dphonys/*` name and semantic version;
- license and Node engine declarations;
- the canonical GitHub `repository.url` and a `repository.directory` equal to its workspace path;
- `files`, runtime/type entry points, and exports describing the built package;
- `publishConfig.access: public`; and
- a `prepack` build.

The canonical check gains one focused Publication-boundary validator for these invariants. `publint` remains responsible for the correctness of the packed entry points. The validator does not attempt brittle source or README heuristics; replacement of Starter behavior and documentation is part of maintainer admission review.

### Maintainer release procedure

From a clean, up-to-date checkout based on `main`, the maintainer runs:

```sh
pnpm change status
pnpm version -r --dry-run
pnpm version -r
pnpm check
```

The maintainer reviews every changed manifest, package `CHANGELOG.md`, and `.changeset/ledger.yaml`, then commits the complete result as the Release commit and lands it through the repository's normal merge policy. A dedicated Release PR is not required. No global version or Git tag is created.

### Publish workflow

`publish.yml` has only `workflow_dispatch`, rejects any ref other than `main`, and uses a non-cancelling concurrency group so two publication runs cannot overlap. Its permissions are:

```yaml
permissions:
  contents: read
  id-token: write
```

On a GitHub-hosted Ubuntu runner it checks out the selected Release commit, installs the repository-pinned pnpm and Node 26, configures the npm registry, runs `pnpm install --frozen-lockfile`, reruns `pnpm check` as the Canonical publication gate, and then runs:

```sh
pnpm publish -r --access public --provenance --no-git-checks
```

The workflow's explicit `main` guard and clean checkout replace pnpm's branch/working-tree checks, which are unsuitable for a detached CI checkout. There is no `NODE_AUTH_TOKEN`, write permission to repository contents, GitHub Environment, GitHub Release, or tag creation. Each npm package trusts the repository and the exact `publish.yml` filename. The absence of a GitHub Environment means any trusted repository writer who can dispatch Actions may publish; that is the accepted authorization boundary.

Recursive publication is intentionally non-atomic. If some packages publish before another fails, the published versions remain. After an operational correction, rerunning publication skips registry versions that already exist and retries missing ones. If package contents must change, the correction receives fresh Release intent rather than attempting to replace an immutable published version. No rollback or release-evidence reconciliation is added.

### First-release bootstrap

An npm trusted publisher cannot be registered before its package exists. For each newly admitted package, a maintainer therefore:

1. lands its first Release commit and reruns the canonical check;
2. inspects `pnpm --filter <package> pack --dry-run`;
3. publishes that package once from a local clean `main` checkout using interactive npm authentication and account 2FA;
4. installs the exact published version in a clean Nuxt app, registers the module, and confirms the app can prepare and build;
5. with npm 11.15 or newer, runs `npm trust github <package> --repo DPHonys/dph-nuxt-stuff --file publish.yml --allow-publish`; and
6. verifies OIDC on the package's next ordinary publication, then changes npm Publishing access to require 2FA and disallow traditional tokens and removes unneeded local publishing credentials.

This exact-version install smoke test is required for First-release bootstrap only. Ordinary releases rely on pull-request previews, the Canonical publication gate, `publint`, and npm's publish result.

### Migration and acceptance checks

Implementation removes the root `release` script, the `changelogen` development dependency, the current tag-triggered `.github/workflows/release.yml`, and `NPM_TOKEN` usage. It adds the pnpm versioning setting, `publish.yml`, maintainer/bootstrap documentation, the Publication-boundary validator, its tests, and the resulting lockfile changes.

Focused acceptance coverage must prove that:

- the Scaffolder still creates a private `0.0.1` package with the complete package-local publication metadata;
- a correctly admitted direct child of `packages/*` passes the Publication-boundary validator;
- a non-private root, Scaffolder, playground, fixture, nested workspace, or package with missing/mismatched publication metadata fails it;
- a representative Release intent produces the expected independent package version and committed package changelog under `pnpm version -r --dry-run`; and
- `publish.yml` is manual-only, main-only, serialized, token-free, least-privileged, gated by `pnpm check`, and recursively publishes with OIDC provenance.
