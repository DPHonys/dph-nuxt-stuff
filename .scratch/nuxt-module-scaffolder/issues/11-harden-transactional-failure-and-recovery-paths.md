# 11 — Harden transactional failure and recovery paths

**What to build:** Make every collision, generation failure, cleanup failure, post-commit failure, and interruption preserve the Scaffolder's safety boundary and give the developer an unambiguous outcome and recovery path.

**Blocked by:** 10 — Deliver the interactive happy path

**Status:** ready-for-agent

**Spec:** [Repository-owned Nuxt module scaffolder](../spec.md)

- [ ] An existing destination represented by a directory, regular file, or symlink is never overwritten, merged into, followed, or removed.
- [ ] A destination appearing after review or immediately before commit returns collision and preserves the unrelated destination.
- [ ] Holding the real cooperative lock deterministically proves that a second same-name invocation cannot touch the destination without relying on timing-sensitive process races.
- [ ] Copy, token, JSON, Magicast, and validation failures before commit leave no destination and remove only the exact staging and lock artifacts owned by that invocation.
- [ ] Cleanup never accepts a caller-controlled path, glob, discovered directory, generated destination, or repository root.
- [ ] Cleanup failure retains and reports the exact owned artifact together with the original error and precise manual-removal guidance.
- [ ] Lock-release failure after commit retains the generated package and reports conservative install and format recovery.
- [ ] Installation failure retains the generated package, does not attempt formatting, exits `1`, and prescribes root installation followed by destination formatting.
- [ ] Formatting failure retains the installed generated package, exits `1`, and prescribes formatting followed by the filtered package test.
- [ ] Interruption before commit removes owned artifacts and leaves no destination; interruption after commit retains the package and prescribes installation then formatting.
- [ ] Signal interruption after confirmation exits `130`; intentional decline and prompt cancellation remain `0`; operational failures remain `1`.
- [ ] Every discriminated outcome renders the exact approved success, cancellation, failure, or recovery copy through the command shell without internal `process.exit()` calls.
- [ ] Real-temporary-repository tests assert destination state, owned-artifact state, post-commit retention, adapter order and suppression, messages, and exit policy across the complete matrix.
- [ ] The documented unrelated writer that ignores the cooperative lock inside the final check-and-rename interval remains explicitly outside the guarantee.
