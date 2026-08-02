# 13 — Approve the real-terminal handoff

**What to build:** Complete and record the one-time Node 26 human acceptance of the real Clack terminal experience after every automated gate is green. This verifies visual readability and keyboard behavior that semantic interaction tests intentionally do not snapshot.

**Blocked by:** 12 — Enforce the disposable Acceptance fixture

**Status:** complete

**Spec:** [Repository-owned Nuxt module scaffolder](../spec.md)

- [x] In a throwaway worktree on Node 26, enter an invalid Scaffold name, correct it, leave description blank, inspect the review, and press Enter at default-No confirmation.
- [x] Confirm that validation and review are readable, ordinary Enter behavior works, the exact no-change message appears, the command exits `0`, and the worktree remains unchanged.
- [x] Run the Scaffolder again, approve creation, and confirm the three lifecycle steps appear in order followed by the exact success and next-step output.
- [x] Run the printed filtered package test command successfully against the created package.
- [x] Run once more with a fresh name, press Ctrl-C during prompting, and confirm readable cancellation, exit `0`, and no filesystem change.
- [x] Record the Node and pnpm versions, the three scenario results, and the human approval in this ticket's comments.
- [x] Do not manually induce install or format failures, collision timing, post-confirmation signal timing, or cleanup failure; the deterministic automated suite remains authoritative for those cases.

## Acceptance comment — 2026-08-02

- Environment: Node `v26.3.0`, pnpm `11.18.0`, disposable detached Git worktree, `TERM=xterm-256color`.
- Default-No: passed. The invalid-name diagnostic and review were readable; ordinary Backspace corrected `Bad_Name`; blank description rendered as `(none)`; Enter selected No; `Scaffolding cancelled. No files were changed.` appeared exactly; exit code was `0`; Git status and the destination remained unchanged.
- Approved creation: passed after correcting a handoff defect found by the first run. Rendering, installation, and formatting appeared in order; exact success and next-step output appeared; exit code was `0`; the printed `pnpm --filter @dphonys/terminal-success-fixed test` command prepared Nuxt and passed its SSR test (`1` file, `1` test).
- Ctrl-C: passed. Ctrl-C at the description prompt rendered `Scaffolding cancelled. No files were changed.` readably; exit code was `0`; the fresh destination remained absent and the pre-run Git status baseline was unchanged.
- Defect resolved during acceptance: a fresh package test initially failed because `.nuxt/tsconfig.json` did not exist. The Template now declares `pretest: nuxt-module-build prepare`, with the generated contract and disposable Acceptance fixture updated to prevent hidden preparation order from returning.
- Human approval: approved by the human maintainer after independently creating a package successfully: “ok tried to create the package it worked so seems good.” The generated `packages/nuxt-api-contract` test package, its lockfile changes, and stale workspace links were removed after approval.
