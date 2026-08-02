# 13 — Approve the real-terminal handoff

**What to build:** Complete and record the one-time Node 26 human acceptance of the real Clack terminal experience after every automated gate is green. This verifies visual readability and keyboard behavior that semantic interaction tests intentionally do not snapshot.

**Blocked by:** 12 — Enforce the disposable Acceptance fixture

**Status:** ready-for-human

**Spec:** [Repository-owned Nuxt module scaffolder](../spec.md)

- [ ] In a throwaway worktree on Node 26, enter an invalid Scaffold name, correct it, leave description blank, inspect the review, and press Enter at default-No confirmation.
- [ ] Confirm that validation and review are readable, ordinary Enter behavior works, the exact no-change message appears, the command exits `0`, and the worktree remains unchanged.
- [ ] Run the Scaffolder again, approve creation, and confirm the three lifecycle steps appear in order followed by the exact success and next-step output.
- [ ] Run the printed filtered package test command successfully against the created package.
- [ ] Run once more with a fresh name, press Ctrl-C during prompting, and confirm readable cancellation, exit `0`, and no filesystem change.
- [ ] Record the Node and pnpm versions, the three scenario results, and the human approval in this ticket's comments.
- [ ] Do not manually induce install or format failures, collision timing, post-confirmation signal timing, or cleanup failure; the deterministic automated suite remains authoritative for those cases.
