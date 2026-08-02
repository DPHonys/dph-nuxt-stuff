# 07 — Prepare Repository support for generated Nuxt packages

**What to build:** Prepare the shared repository policies and verification pipeline that every generated Nuxt package will inherit, while keeping the package-less repository green. This is the prefactor that lets later Scaffolder slices add working packages without redesigning workspace discovery, dependency ownership, or CI.

**Blocked by:** None — can start immediately

**Status:** done

**Spec:** [Repository-owned Nuxt module scaffolder](../spec.md)

- [x] The pnpm catalog contains the approved Nuxt 4.5-era runtime and development baselines, including the repository's existing exact TypeScript native-bridge identity, without migrating unrelated dependencies.
- [x] Workspace discovery retains top-level packages, includes nested generated-package playgrounds, and does not treat consumer test fixtures as workspaces.
- [x] Root plain TypeScript checking excludes generated packages, while Turbo owns their Nuxt-aware type checks without weakening the repository's strict compiler policy.
- [x] Turbo retains existing behavior, recognizes both module distribution and Nuxt application build output, and aggregates package tests and build-before-`publint` checks.
- [x] The canonical root gate runs type checking, format checking, linting, tests, builds, and `publint` in the approved order and succeeds before any generated package exists.
- [x] Shared ignore policy covers Nuxt, Nitro, and Nuxt output at every depth without adding obsolete Playwright or coverage entries.
- [x] CI runs the canonical gate on Node 26, and preview publication depends on that successful gate.
- [x] Release runs the same canonical gate on Node 26 before the existing release operation; versioning and publication behavior are otherwise unchanged.
- [x] The implementation takes only the focused Repository support needed by the spec and does not merge the historical module branch wholesale.
