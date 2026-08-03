# 06 — Deliver First-release bootstrap

**What to build:** Give a maintainer a complete, safe operator path for turning one private Generated package into an installable Publishable package and registering the trusted workflow, while keeping bootstrap exceptional and ordinary publication token-free.

**Blocked by:** 05 — Publish Release commits through trusted OIDC

**Status:** ready-for-agent

**Spec:** [Low-ceremony independent package publishing](../spec.md)

- [ ] Admission guidance keeps a Generated package private until Starter behavior and generated documentation are replaced, package identity and metadata are reviewed, packed contents are inspected, and the first Release intent is committed.
- [ ] Removing `private` is the only package-admission state change; no readiness file, service, allowlist, or admission workflow is introduced.
- [ ] The runbook explains that a registry-absent package debuts at its seeded `0.0.1` rather than receiving an extra first-release bump.
- [ ] Bootstrap starts only from the admitted package's landed Release commit on clean `main` after the Canonical publication gate succeeds.
- [ ] The maintainer inspects the selected package's dry-run tarball before any authenticated operation.
- [ ] The first publication targets only the new package and uses local interactive npm authentication with account 2FA rather than a workflow secret or bootstrap token path.
- [ ] After publication, the maintainer installs the exact registry version into a clean Nuxt application, registers the module, and confirms Nuxt preparation and production build succeed.
- [ ] With npm 11.15 or newer, the maintainer registers GitHub Actions trust for the package, canonical repository, exact `publish.yml` filename, and direct publish permission without an Environment or staged-publish permission.
- [ ] The maintainer verifies OIDC on the package's next ordinary publication before requiring 2FA, disallowing traditional token publication, and removing unneeded local publishing credentials.
- [ ] The runbook clearly separates one-time First-release bootstrap from routine Release intent, Release commit, and workflow-dispatch procedures.
- [ ] Routine releases do not add an automated exact-version consumer smoke test; they continue to rely on pull-request previews, the Canonical publication gate, `publint`, and npm's publish result.
- [ ] Automated coverage preserves the Scaffolder's private `0.0.1` package contract and validates documentation/configuration boundaries without creating an npm package, changing npm trust, requesting real OIDC credentials, or publishing a version.
- [ ] A concise manual acceptance record covers tarball inspection, local first publication, exact-version Nuxt consumption, trusted-publisher registration, first OIDC success, and token restriction for each newly admitted package.
- [ ] Completing this ticket does not admit or publish any current repository package; it delivers the repeatable handoff for the first future package.
