# 04 — Prepare Independent package releases with pnpm

**What to build:** Let developers record consumer-visible Release intent and let a maintainer safely preview and create one reviewed Release commit that independently versions every queued package, writes package changelogs, and propagates only necessary Dependency-only releases.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

**Spec:** [Low-ceremony independent package publishing](../spec.md)

- [ ] pnpm release management stores changelogs in the repository without fixed groups, lanes, epics, synchronized versions, or a maximum-bump policy.
- [ ] No central versioning allowlist is introduced; Publication-boundary enforcement and package privacy remain the source of package eligibility.
- [ ] Developer guidance requires a patch, minor, or major Release intent and changelog-quality summary for consumer-visible package changes while requiring no `none` declaration for internal-only work.
- [ ] Maintainer guidance covers release-plan status, a non-mutating recursive version preview, unfiltered recursive versioning of every pending intent, the canonical check, and review of changed manifests, package changelogs, and the consumed-intent ledger.
- [ ] A Release commit can land through normal repository merge policy without a dedicated Release PR, repository-wide version, root changelog, Git tag, or GitHub Release.
- [ ] Integration tests invoke the repository-pinned pnpm CLI inside disposable Git repositories and use a deterministic local registry boundary rather than depending on public npm state.
- [ ] An intent for one of two unrelated Publishable packages changes only that package's plan, version, changelog, and ledger state.
- [ ] A compatible internal workspace dependency range leaves its downstream package unchanged.
- [ ] An upstream release that invalidates a downstream workspace range produces exactly one downstream patch Dependency-only release and preserves an installable packed dependency declaration.
- [ ] A package absent from the registry keeps its seeded `0.0.1` version for its first release while producing the intended changelog and ledger state.
- [ ] Multiple pending intents appear in one release plan and are consumed by one ordinary unfiltered recursive versioning run.
- [ ] Dry-run planning leaves the disposable checkout unchanged, while the corresponding real disposable versioning run writes versions, package changelogs, and ledger entries without creating a Git commit or tag.
- [ ] Tests and documentation do not publish a real package, admit an existing Generated package, or change the repository root into a released project.
- [ ] The canonical repository check remains green with native release preparation available alongside the still-unmigrated publication path.
