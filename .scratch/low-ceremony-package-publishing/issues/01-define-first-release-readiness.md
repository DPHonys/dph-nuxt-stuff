# Define first-release readiness

Type: grilling
Status: resolved
Assignee: codex
Blocked by: [Establish the low-ceremony publishing fit](00-establish-the-low-ceremony-publishing-fit.md)

## Question

What minimal state and transition should prevent a newly generated `0.0.1` package from being published before its starter behavior and documentation are replaced?

## Answer

Every generated package starts with `private: true`. That standard manifest field is the complete readiness gate: recursive publication skips the package, and the package can still be developed, tested, built, and consumed by its workspace playground.

A maintainer admits the package to publication by removing `private: true` only after replacing the Starter behavior and package documentation, confirming the package metadata and packed contents, and passing the canonical repository check. The same change records the package's first release intent with `pnpm change`. pnpm's first-release behavior publishes the manifest's seeded `0.0.1` rather than inventing an additional bump.

The package then follows the ordinary release path: `pnpm version -r`, review and commit the generated version/changelog state, and let the publish workflow publish missing registry versions. There is no separate readiness file, admission workflow, Release PR, package-qualified tag, or GitHub Release requirement.

Each new npm package name still needs one authenticated bootstrap publication before its per-package trusted publisher can be configured. After bootstrap, configure and verify GitHub Actions OIDC for that package and remove any temporary write token. This unavoidable registry setup is an operator checklist, not a second package-readiness state.
