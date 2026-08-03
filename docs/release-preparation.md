# Preparing Independent package releases

This repository uses pnpm Release intents to prepare independently versioned
packages. Release preparation changes repository state only; publishing remains
a separate maintainer action.

## Record Release intent

Commit a Release intent alongside every consumer-visible package change:

```sh
pnpm change
```

Choose each affected Publishable package, select `patch`, `minor`, or `major`,
and write a summary suitable for that package's changelog. One intent may name
several packages when one change affects several consumer contracts.

Internal-only work needs no `none` intent. Do not use commit-message inference,
fixed package groups, or a central versioning allowlist to replace an explicit
Release intent.

## Prepare one Release commit

Start from a clean, current branch based on `main`. Inspect and preview every
queued intent before changing the checkout:

```sh
pnpm change status
pnpm version -r --dry-run
```

The preview is non-mutating. Check the complete plan, including any downstream
patch marked as a Dependency-only release. Correct an intent before continuing
if its package, bump, summary, or dependency propagation is wrong.

Apply every pending intent in one ordinary, unfiltered run, then run the
Canonical publication gate:

```sh
pnpm version -r
pnpm check
```

Do not use `--filter` for an ordinary release; filtering is reserved for
recovery. Recursive versioning does not create a Git commit or tag. Review all
changed package manifests, every package-local `CHANGELOG.md`, deleted intent
files, and `.changeset/ledger.yaml`. Commit that complete reviewed state as the
Release commit.

The Release commit lands through the normal repository merge policy. It does
not require a dedicated Release PR, repository-wide version, root changelog,
Git tag, or GitHub Release.

## Publish one Release commit

After the reviewed Release commit reaches `main`, open the **Publish** workflow
in GitHub Actions, choose **Run workflow**, select `main`, and dispatch it. The
workflow rejects any other selected ref. It checks out the selected Release
commit, installs the frozen dependency graph, and reruns the complete
`pnpm check` Canonical publication gate before it attempts publication.

The fresh gate is publication authority for that exact Release commit. An
older pull-request check is not sufficient because the state that ultimately
reached `main`, including versions, changelogs, the consumed-intent ledger, and
dependencies, may differ from the earlier checked state.

Recursive publication is deliberately non-atomic. If an operational failure
occurs after some package versions have published, leave those immutable
versions in place, correct the operational problem, and dispatch the workflow
again from `main`. pnpm skips versions already present in npm and attempts only
the missing versions.

If a correction changes package contents, record fresh Release intent and
prepare a new version in a new Release commit. Never try to replace an existing
registry version. This repository does not add rollback automation, tarball
handoff state, a publication evidence ledger, or a reconciliation job.

## Bootstrap a new package name

The workflow cannot publish a package name until that package exists on npm and
has a trusted publisher. For a newly admitted Publishable package, follow the
one-time [First-release bootstrap](./first-release-bootstrap.md) after its first
Release commit has landed on `main`.

Bootstrap is exceptional. Do not use its local authenticated publication or
exact-version Nuxt consumer proof for routine releases. Routine releases use
Release intent, a reviewed Release commit, the manual **Publish** workflow,
pull-request previews, the Canonical publication gate, `publint`, and npm's
publish result.
