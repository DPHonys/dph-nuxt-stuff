# Current pnpm-native package publishing for this monorepo

Research date: 2026-08-02

## Recommendation

Use **pnpm's native independent release flow** and one small GitHub Actions publish job. Do not implement the full Wayfinder design now, and do not add Changesets CLI, release-it, or a custom release orchestrator yet.

The maintainer workflow can be:

```sh
# while making a consumer-visible change
pnpm change

# when ready to release everything currently queued
pnpm change status
pnpm version -r --dry-run
pnpm version -r

# review and commit the changed versions/changelogs, then push
```

The publish workflow checks the committed release state and runs:

```sh
pnpm publish -r --access public --provenance
```

This is available without a new dependency because the repository already pins `pnpm@11.18.0` in [the root package manifest](../../../package.json). pnpm added native change intents and recursive workspace versioning in 11.13, and first-release handling in 11.16. `pnpm change` writes Changesets-compatible Markdown intents; `pnpm version -r` independently bumps the named packages, propagates necessary workspace-dependent bumps, and writes changelogs. Recursive `pnpm publish` publishes workspace versions that are not already present in the registry. ([pnpm release management](https://pnpm.io/versioning), [`pnpm change`](https://pnpm.io/cli/change), [`pnpm version`](https://pnpm.io/cli/version), [`pnpm publish`](https://pnpm.io/cli/publish))

This recommendation deliberately keeps release intent lightweight:

- Add an intent for a change that should produce a release; do not require an empty "no release" file on every other pull request.
- Keep versions independent by default. Add a `versioning.fixed` group only if some packages become one product that consumers must upgrade together.
- Keep per-package `CHANGELOG.md` files, but initially treat npm publication as the required result. Package-qualified Git tags and separate GitHub Releases are optional presentation, not prerequisites for using a package.
- Keep a generated package `private: true` until it is genuinely publishable, then remove `private` and record its first release intent. This is a much simpler readiness switch than a separate admission workflow.

pnpm's native release feature is newer than the release systems in the Nuxt repositories surveyed below. That is the main trade-off. Its intent format is compatible with Changesets, so adopting the Changesets action later remains possible without throwing away existing release notes. ([pnpm's Changesets-compatible format](https://pnpm.io/versioning), [using Changesets with pnpm](https://pnpm.io/using-changesets))

## Why the earlier proposal felt too large

The discarded package-publishing effort was internally coherent, but it specified a release platform rather than the minimum needed to publish packages. It chose all of the following at once:

- mandatory release or no-release declarations on every relevant pull request;
- an automation-maintained Release PR as the only publication authorization;
- separate planning, artifact preparation, OIDC publication, and metadata-reconciliation jobs;
- immutable tarball manifests and hashes passed between jobs;
- per-package npm provenance verification, tags, GitHub Releases, and changelogs as required "release evidence";
- deterministic partial-failure handling and repair of missing metadata.

Those choices can make sense for a large team that needs formal release governance and self-healing metadata. They are not required to develop a workspace package, publish it safely, and install it elsewhere.

There are also two concrete reasons not to continue the existing root flow unchanged:

1. The root `release` script runs `changelogen --release --push --publish` from the private root package, not from independently selected `packages/*` projects ([root `package.json`](../../../package.json), [current workflow](../../../.github/workflows/release.yml)).
2. Changelogen documents a single current directory, package manifest, changelog, version, and tag. Its default comparison starts at the repository's latest Git tag, which does not model several independent package histories. It is a good fit for one released project, not this independent-package requirement. ([Changelogen CLI documentation](https://github.com/unjs/changelogen/blob/main/README.md))

## What maintained Nuxt repositories do

The common Nuxt pattern is simpler than the Wayfinder proposal, but it usually gets that simplicity by publishing **tightly coupled packages at one fixed version**.

| Repository | Version/release shape | Lesson for this repository |
| --- | --- | --- |
| Nuxt core | `nuxt` and `@nuxt/kit` carry the same version and use `workspace:*`; a tag-triggered workflow runs a repository-specific script that loops over packages and publishes them. ([nuxt manifest](https://github.com/nuxt/nuxt/blob/main/packages/nuxt/package.json), [kit manifest](https://github.com/nuxt/nuxt/blob/main/packages/kit/package.json), [workflow](https://github.com/nuxt/nuxt/blob/main/.github/workflows/release.yml), [release script](https://github.com/nuxt/nuxt/blob/main/scripts/release.ts)) | Fixed versions are ergonomic for one framework suite. Nuxt's custom script exists for multiple major lines, nightlies, several dist-tags, skipped packages, and special file handling; it is not a small-monorepo baseline. |
| Nuxt ESLint | The root release command is `bumpp "package.json" "packages/**/package.json"`; the root and packages share one version and internal dependencies use `workspace:*`. ([root manifest](https://github.com/nuxt/eslint/blob/main/package.json), [module manifest](https://github.com/nuxt/eslint/blob/main/packages/module/package.json)) | A very small fixed-version flow works well when packages are parts of one product. |
| Nuxt DevTools | The root command is `pnpm test && bumpp -r --all`; publishable packages use `prepack` builds and `workspace:*` internal dependencies. ([root manifest](https://github.com/nuxt/devtools/blob/main/package.json), [DevTools manifest](https://github.com/nuxt/devtools/blob/main/packages/devtools/package.json)) | Again, low ceremony comes from releasing the whole coupled suite together. |
| Nuxt UI / Nuxt Content | Both use release-it around one primary published package. Nuxt UI even disables release-it's npm publication and uses it for version/tag/release presentation. ([Nuxt UI manifest](https://github.com/nuxt/ui/blob/v4/package.json), [Nuxt UI release-it config](https://github.com/nuxt/ui/blob/v4/.release-it.json), [Nuxt Content manifest](https://github.com/nuxt/content/blob/main/package.json)) | release-it is a pleasant one-package tool, but its official monorepo recipe is for bumping every workspace to one version, not independent packages. ([release-it monorepo recipe](https://github.com/release-it/release-it/blob/main/docs/recipes/monorepo.md)) |

This repository is different if `packages/*` will contain unrelated Nuxt modules that can ship at different cadences. Copying the fixed-version Nuxt pattern would reduce tooling, but it would also bump and republish unchanged packages. pnpm-native independent releases keep the same small operational surface without introducing that coupling.

## Development and workspace dependencies

No path-rewriting machinery is needed. Use ordinary package names and the `workspace:` protocol for internal dependencies:

- `workspace:*` is packed as an exact version;
- `workspace:^` is packed as a caret range;
- `workspace:~` is packed as a tilde range.

pnpm links those packages locally and rewrites the dependency specs while packing or publishing, so consumers receive normal npm-compatible versions. Prefer `workspace:^` when a downstream package should accept compatible upstream releases without being republished. ([pnpm workspace protocol and publication rewriting](https://pnpm.io/workspaces#publishing-workspace-packages))

Development remains the existing package-local Nuxt workflow: build/stub the module, run its playground against the linked workspace package, and use `prepack` to create the publishable `dist`. The current module template already supplies the relevant exports, `files`, `prepack`, public access, and package-filtered development commands ([template manifest](../../../templates/nuxt-module/package.json), [template README](../../../templates/nuxt-module/README.md)).

## npm authentication: the unavoidable small amount of setup

Use GitHub Actions OIDC trusted publishing after a package exists. The publish job needs a GitHub-hosted runner, `id-token: write`, and read-only repository access. Do not keep a long-lived npm write token. Trusted publication gives public packages from public repositories automatic provenance, and npm recommends disabling traditional token publication after OIDC has been verified. ([npm trusted publishing](https://docs.npmjs.com/trusted-publishers/))

Registration is per npm package, not once for the whole scope. The configured repository, workflow filename, and optional GitHub environment must match exactly. A package must already exist before `npm trust` can configure it, and the maintainer running `npm trust` needs account 2FA. ([`npm trust` prerequisites](https://docs.npmjs.com/cli/v11/commands/npm-trust/#prerequisites))

For a brand-new package, accept one simple bootstrap step:

1. Inspect the tarball with `pnpm pack --dry-run` and run the repository checks.
2. Publish the first version once with maintainer authentication and 2FA (or a deliberately short-lived bootstrap token in Actions).
3. Register the repository's publish workflow as that package's trusted publisher.
4. Verify one OIDC publication, choose "Require two-factor authentication and disallow tokens", and revoke any bootstrap token.

pnpm 11's native publish implementation supports OIDC trusted publishing; current pnpm release notes include fixes specifically for `pnpm publish` with OIDC. ([pnpm releases](https://github.com/pnpm/pnpm/releases)) If maximum proof-of-presence is wanted later, npm can restrict the workflow to staged publishing, where CI stages the package and a maintainer approves it with 2FA. That is optional extra ceremony, not a prerequisite. ([npm staged/trusted publishing](https://docs.npmjs.com/trusted-publishers/#recommended-restrict-token-access-when-using-trusted-publishers))

## Tool choice

| Tool | Fit here |
| --- | --- |
| **pnpm native release management** | Best starting point. Already installed; independent versions, change intents, changelogs, workspace propagation, first releases, and recursive registry-aware publishing are built in. |
| **Changesets CLI + action** | Add later if an automatically maintained Version Packages PR and package-qualified GitHub Releases become valuable. It is the established independent-monorepo choice, but the discarded plan added governance and recovery requirements well beyond Changesets' basic workflow. ([Changesets introduction](https://github.com/changesets/changesets/blob/main/docs/intro-to-using-changesets.md), [Changesets action](https://github.com/changesets/action)) |
| **bumpp + `pnpm publish -r`** | Simplest fixed-version option and common in Nuxt. Use only if all public packages are one product and should always ship together. |
| **release-it** | Good for one package. Its official monorepo recipe assumes one synchronized version and additional per-workspace configuration. |
| **Changelogen** | Keep for a single-package repository, not for independently versioned workspaces. Its tag/changelog boundary is repository-wide by default. |
| **Raw `pnpm publish` only** | Publishing is easy, but version selection and dependency propagation become manual. pnpm's native `change`/`version` layer solves exactly that with little added ceremony. |

## A sensible first implementation boundary

Implement only:

1. pnpm `versioning` configuration that ignores private support workspaces and stores package changelogs in the repository;
2. documentation for `pnpm change`, `pnpm version -r`, and the one-time npm bootstrap/trust registration;
3. package metadata/readiness rules (`private`, `repository.directory`, `files`, `exports`, `publishConfig`, `prepack`);
4. one manually triggered or release-commit-triggered workflow that installs, runs the canonical checks, and executes OIDC-authenticated `pnpm publish -r`;
5. a smoke test that installs the exact published version in a clean Nuxt app.

Defer mandatory no-release declarations, a Release PR bot, multiple privilege-separated jobs, tarball hand-off manifests, automatic tag/GitHub Release creation, and release-evidence reconciliation until actual team size or failure history makes those costs worthwhile.
