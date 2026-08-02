# 12 — Enforce the disposable Acceptance fixture

**What to build:** Make the canonical repository gate prove the production Scaffolder, Nuxt module Template, Package-local contract, and Repository support together by generating and executing one deterministic package in a disposable repository on every pull request and release.

**Blocked by:** 11 — Harden transactional failure and recovery paths

**Status:** ready-for-agent

**Spec:** [Repository-owned Nuxt module scaffolder](../spec.md)

- [ ] Every canonical root check creates an `api-2-client` Acceptance fixture with a padded non-empty description and fixed year through the production registry, renderers, validators, transaction, installer, and formatter.
- [ ] The fixture lives in a disposable repository and performs a real repository-root `pnpm install --no-frozen-lockfile`, so no working-repository lockfile is changed.
- [ ] Before installation, assertions cover the exact required output roles, all prohibited files, every derived identity and metadata field, trimmed description, package commands and dependency roles, Nuxt compatibility, README sections, exactly three Handoff markers, fixed license year, and absence of known tokens, locks, and staging artifacts.
- [ ] After production formatting, Oxfmt check mode succeeds over the generated package.
- [ ] The generated package's lint, Nuxt-aware typecheck, real Nuxt Test Utils SSR test, distribution build, playground build, and `publint` all succeed.
- [ ] The SSR fixture proves the configured override reaches the generated runtime injection and rendered response.
- [ ] The playground compiles against the workspace package and contains the generated display name and default Starter message.
- [ ] pnpm and Turbo discover both the generated package and its nested playground through actual Repository support rather than direct unregistered-directory tool calls.
- [ ] Acceptance uses the catalog-pinned current Nuxt 4 release and separately asserts the exact `>=4.0.0` compatibility declaration without adding a Nuxt 4.0.0 install matrix.
- [ ] Teardown removes the disposable repository after success or failure, and no golden generated package is committed.
- [ ] The focused Scaffolder tests run once before Turbo package tests, and the complete acceptance remains mandatory inside `pnpm check` rather than an optional or nightly command.
- [ ] CI preview and release remain gated by the same successful Node 26 root check.
- [ ] The suite introduces no numeric coverage target or ANSI terminal snapshots.
