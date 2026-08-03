# 05 — Publish Release commits through trusted OIDC

**What to build:** Replace the legacy root release path with one deliberate workflow that publishes missing package versions only from a reviewed Release commit on `main`, after the Canonical publication gate, using npm trusted publishing and provenance without a persistent write token.

**Blocked by:** 03 — Enforce the Publication boundary; 04 — Prepare Independent package releases with pnpm

**Status:** ready-for-agent

**Spec:** [Low-ceremony independent package publishing](../spec.md)

- [ ] The sole production publication workflow has the externally stable filename `publish.yml` and can be started only by manual dispatch.
- [ ] The workflow rejects a selected ref other than `main` before any publication can occur.
- [ ] All publication runs share one non-cancelling concurrency group, so a second run waits instead of racing with or cancelling a partially completed run.
- [ ] Workflow permissions are limited to reading repository contents and requesting an OIDC identity token.
- [ ] The workflow uses a GitHub-hosted Ubuntu runner, the repository-pinned pnpm, Node 26, the public npm registry, and a frozen dependency installation.
- [ ] The complete canonical `pnpm check`, including Publication-boundary enforcement, succeeds against the selected Release commit before the publish command runs.
- [ ] Publication recursively attempts only missing non-private package versions with public access and provenance, with pnpm Git checks disabled only because the workflow already enforces `main` and a clean CI checkout.
- [ ] The workflow contains no npm write token, repository write permission, GitHub Environment, staged-publication permission, versioning step, tag behavior, GitHub Release behavior, push trigger, tag trigger, schedule, or reusable-workflow publication path.
- [ ] A workflow-contract test parses the workflow as configuration and verifies its trigger, branch guard, concurrency, permissions, preparation order, canonical gate, publication contract, and prohibited capabilities.
- [ ] The root Changelogen release command, Changelogen dependency, tag-triggered legacy workflow, `NPM_TOKEN` use, and their resulting lockfile state are removed so only one authoritative publication path remains.
- [ ] Maintainer guidance explains how to dispatch from the reviewed Release commit and why an older pull-request check is not sufficient publication authority.
- [ ] Maintainer guidance accepts non-atomic recursive publication: successful versions remain, operational failures are corrected and rerun, and existing registry versions are skipped.
- [ ] Guidance requires fresh Release intent when package contents must change and adds no rollback, tarball handoff, evidence ledger, or reconciliation automation.
- [ ] Existing pull-request preview publication remains unchanged and continues to depend on the canonical repository check.
- [ ] The canonical check passes with the legacy release machinery fully removed and the trusted workflow installed, without performing a live npm publication.
