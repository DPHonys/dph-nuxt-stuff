# First-release bootstrap

Use this procedure once for each newly admitted Publishable package. It creates
the npm package name, proves that its seeded first version works for a real Nuxt
consumer, and registers `.github/workflows/publish.yml` as its trusted
publisher. After trust is verified, ordinary publication is token-free.

This runbook does not admit or publish any package by itself. Substitute the
real package name, version, and directory in every command, and record the
evidence requested in the final checklist.

## 1. Admit the Generated package

A Generated package starts at `0.0.1` with `private: true`. Keep it private
while its package developer and a maintainer complete this review:

- Replace the Template's Starter behavior, its tests and playground examples,
  the generated README, and every Handoff marker with the package's real
  consumer contract and documentation.
- Review the `@dphonys/*` package name, description, keywords, license, Node
  engine, canonical repository identity and directory, public access, packaged
  files, runtime and type entry points, exports, and `prepack` build.
- Pass the Canonical publication gate and inspect the complete prospective
  tarball while the package is still private. The gate builds the package and
  runs `publint`:

  ```sh
  pnpm check
  pnpm --filter @dphonys/example pack --dry-run
  ```

- Confirm that the intended package name is absent from the public npm registry
  and that `0.0.1` is still the manifest version.

When the review is complete, remove only `private: true` from the package
manifest and run `pnpm change`. Select the package, choose the semantic impact
of its initial consumer contract, and write changelog-quality release notes.
Commit the manifest change and first Release intent together. Do not merge an
admission that contains one without the other.

Removing `private` is the entire admission transition. Do not add a readiness
file, package allowlist, service, or admission workflow. The first Release
intent is still required even though a registry-absent package debuts at the
seeded `0.0.1`; pnpm does not apply an extra first-release bump.

The admission change then follows the ordinary
[Release commit procedure](./release-preparation.md#prepare-one-release-commit).
Bootstrap must not begin until that reviewed Release commit, including the
package's `0.0.1` changelog and consumed-intent ledger entry, has landed on
`main`.

## 2. Recheck the landed Release commit

Start from a clean, current local checkout of `main`. Confirm that the admitted
package is non-private at `0.0.1` and that its Release commit is present. Run the
Canonical publication gate, then inspect the selected package's dry-run tarball
again before logging in to npm or performing any other authenticated operation:

```sh
git switch main
git pull --ff-only
git status --short
pnpm check
pnpm --filter @dphonys/example pack --dry-run
```

`git status --short` must produce no output before continuing. Read the tarball
file list and metadata; stop if it contains source, secrets, local configuration,
unexpected generated files, or lacks any runtime/type entry point. Fix package
contents through fresh Release intent and a new Release commit rather than
publishing the inspected version.

## 3. Publish only the new package locally

Use a maintainer npm account with account 2FA enabled. Authenticate
interactively only after the gate and tarball review have succeeded:

```sh
npm login --registry=https://registry.npmjs.org
npm whoami --registry=https://registry.npmjs.org
pnpm --filter @dphonys/example publish --access public
```

Respond to npm's interactive 2FA challenge when requested. The filter is a
safety boundary: this bootstrap publication must target only the new package.
Do not use recursive publication, a workflow secret, a bootstrap token, or a
token-capable branch in `publish.yml`.

Record npm's successful publication of exactly `@dphonys/example@0.0.1`. If it
fails before publishing, correct the operational problem and retry the same
targeted command. If the version did publish, it is immutable; any content
correction needs fresh Release intent and a new version.

## 4. Prove exact-version Nuxt consumption

Create a new Nuxt application outside this repository so no workspace link or
local tarball can satisfy the dependency. Select npm if the creator asks for a
package manager, then install the exact registry version rather than a range or
tag:

```sh
npm create nuxt@latest first-release-consumer
cd first-release-consumer
npm install --save-exact --registry=https://registry.npmjs.org @dphonys/example@0.0.1
```

Register the package in the clean application's `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['@dphonys/example'],
})
```

Then prove both Nuxt preparation and the production build:

```sh
npx nuxt prepare
npm run build
```

Save the exact installed version and both successful command results in the
acceptance record. This consumer proof belongs only to First-release bootstrap;
do not add it as an automated check for ordinary releases.

## 5. Register the trusted publisher

Use npm CLI 11.15.0 or newer while signed in as a package maintainer with 2FA.
Register GitHub Actions trust for the package, the canonical repository, and
the exact workflow filename:

```sh
npm --version
npm trust github @dphonys/example --repo DPHonys/dph-nuxt-stuff --file publish.yml --allow-publish
```

The registration grants direct publish permission. Do not supply an Environment
and do not grant staged-publish permission. The repository name and
`publish.yml` filename are external npm configuration: if either changes, every
package's trust registration must be migrated.

Do not tighten token access yet. A registered publisher is not proven until an
ordinary Release commit has successfully published this package through OIDC.

## 6. Verify OIDC, then restrict tokens

For the package's next consumer-visible change, use the ordinary path: commit
Release intent with the change, prepare and land the reviewed Release commit,
then manually dispatch **Publish** from `main`. Confirm that the workflow
published the expected package version with npm provenance and without an npm
write token.

Only after that OIDC success, open the package's npm **Publishing access**
settings and choose **Require two-factor authentication and disallow tokens**.
Then run `npm logout --registry=https://registry.npmjs.org` on the bootstrap
machine if its local npm session is no longer needed, and remove any unneeded
package-scoped publishing credential from the maintainer's npm configuration.
Do not remove credentials still needed for other packages or accounts.

## Manual acceptance record

Copy this concise record into the package's admission tracking issue or pull
request. It is operator evidence, not a repository readiness file or automated
release ledger.

```md
### First-release bootstrap: @dphonys/example

- Release commit on `main`: <commit SHA>; clean `pnpm check`: <run/date>
- Tarball: `@dphonys/example@0.0.1`; inspected files/metadata: <evidence>
- Local first publication: <npm result/date>; account 2FA: confirmed
- Clean Nuxt consumer: exact `@dphonys/example@0.0.1`; prepare/build: passed
- Trusted publisher: `DPHonys/dph-nuxt-stuff`, `publish.yml`, direct publish,
  no Environment or staged publish: <registration/date>
- First OIDC publication: <workflow run/version>; provenance: confirmed
- Token restriction: require 2FA and disallow tokens; unneeded local publishing
  credentials removed: <confirmation/date>
```
