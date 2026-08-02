# 10 — Deliver the interactive happy path

**What to build:** Expose the working Nuxt module generation path through `pnpm scaffold` with the approved Clack interaction, explicit review and confirmation, real repository-root dependency installation, destination-scoped formatting, and exact success guidance.

**Blocked by:** 09 — Generate the Nuxt module Package-local contract

**Status:** ready-for-agent

**Spec:** [Repository-owned Nuxt module scaffolder](../spec.md)

- [ ] `pnpm scaffold` enters through a thin Citty shell that delegates all behavior to the deep Scaffolder operation and translates its outcome to `process.exitCode`.
- [ ] The terminal opens with `Scaffold a workspace package` and shows Nuxt module as the visible, preselected Template kind.
- [ ] Scaffold name has no default and reports the exact approved messages for empty, overlength, noncanonical, and existing-destination input while allowing inline correction.
- [ ] The optional description defaults to blank, trims surrounding whitespace, and remains absent when blank.
- [ ] Review shows Template kind, destination, scoped package, Nuxt module name, configuration key, display name, and description or `(none)` before any write.
- [ ] `Create this package? (y/N)` defaults to No, and declining or cancelling before confirmation prints the exact no-change message, exits `0`, and touches neither filesystem nor post-commit adapters.
- [ ] Confirmation shows rendering and validation, repository-root pnpm installation, and destination formatting in the approved order.
- [ ] Production installation uses nypm at the explicit repository root, verifies that the detected manager is pnpm, and inherits normal terminal output.
- [ ] Production formatting runs Oxfmt against only the generated destination after installation succeeds.
- [ ] A successful run prints the exact created package and destination, the filtered development and test commands, and `Full verification was not run.`
- [ ] A real successful run leaves a formatted generated package and an updated root lockfile, returns the created outcome, and exits `0`.
- [ ] Scripted interaction tests assert semantic prompt and progress events plus exact approved copy rather than snapshotting Clack ANSI output.
