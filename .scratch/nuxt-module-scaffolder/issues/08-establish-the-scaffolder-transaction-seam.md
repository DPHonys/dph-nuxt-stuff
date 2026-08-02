# 08 — Establish the Scaffolder transaction seam

**What to build:** Establish one deep, testable Scaffolder operation that can take a confirmed scripted request through a declarative test Template, staging, validation, atomic commit, and successful post-commit effects. This narrow end-to-end core makes the real Nuxt Template and terminal UI straightforward additions rather than parallel orchestration paths.

**Blocked by:** 07 — Prepare Repository support for generated Nuxt packages

**Status:** done

**Spec:** [Repository-owned Nuxt module scaffolder](../spec.md)

- [x] Production exposes one high-level Scaffolder operation accepting a repository root and optional abort signal and returning a discriminated outcome.
- [x] A private composition seam supports scripted interaction and recording post-commit adapters without exposing additional production APIs solely for tests.
- [x] The static registry model defines Template identity, source, required output, allowed text tokens, and a pure preparation operation.
- [x] Preparation creates one frozen naming context and an immutable, path-confined render and validation plan.
- [x] The initial plan vocabulary supports Template copying, allowlisted plain-text replacement, structured JSON metadata, a named Magicast mutation, and declarative validation without arbitrary imperative Template hooks.
- [x] An unexpected structured-source shape or unresolved known token fails safely rather than falling back to regex rewriting.
- [x] A confirmed scripted request acquires an exclusive destination lock, renders and validates in an owned same-filesystem staging sibling, commits by rename, releases the lock, and invokes install before formatting.
- [x] A small test-only Template proves the complete success path against a real temporary repository, including destination contents, adapter arguments, repository-root working directory, and call order.
- [x] The root test command runs the focused Scaffolder suite exactly once before Turbo package tests, and the canonical root gate remains green.
- [x] Neither the Scaffolder nor its dependencies call `process.exit()`; the executable shell remains outside this ticket.
