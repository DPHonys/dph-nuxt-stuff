# 03 — Enforce the Publication boundary

**What to build:** Give maintainers one repository-level publishing-contract command that makes package admission objectively verifiable: the canonical check accepts private support workspaces and correctly admitted Publishable packages, while reporting every workspace that crosses the Publication boundary or lacks required publication metadata.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

**Spec:** [Low-ceremony independent package publishing](../spec.md)

- [ ] The publishing-contract command accepts a repository root, discovers its workspace manifests, and returns success for a repository containing only private support workspaces.
- [ ] A non-private direct child of the package collection passes when it has the approved `@dphonys` identity, semantic version, license, Node engine, canonical repository identity and matching directory, packaged-file declaration, runtime and type entry points, exports, public access, and prepack build.
- [ ] A non-private root, Scaffolder, playground, consumer fixture, nested workspace, workspace outside the package collection, or other support project fails the Publication-boundary check.
- [ ] A direct Publishable package independently fails for each missing or invalid publication-metadata responsibility, with a diagnostic naming the workspace and violated rule.
- [ ] One run reports all discovered violations before returning a nonzero result rather than stopping after the first error.
- [ ] Private workspaces are not required to imitate the public Package-local contract, so internal repository tooling can retain fit-for-purpose manifests.
- [ ] The validator does not inspect source prose, Starter behavior, documentation text, or Handoff markers; semantic admission remains a maintainer decision.
- [ ] `publint` remains responsible for detailed packed-entry-point correctness rather than being reimplemented in the Publication-boundary command.
- [ ] The command and its tests are mandatory within the canonical `pnpm check` gate.
- [ ] Tests exercise the command at its process boundary with disposable repositories, observable exit results, actionable diagnostics, real filesystem state, and deterministic cleanup.
- [ ] Existing Scaffolder coverage continues to prove that a Generated package starts private at `0.0.1` while carrying the complete future publication metadata.
- [ ] The repository's complete canonical check remains green after the new policy is enforced.
