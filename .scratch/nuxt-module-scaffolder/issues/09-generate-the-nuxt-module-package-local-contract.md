# 09 — Generate the Nuxt module Package-local contract

**What to build:** Add the real Nuxt module Template so a confirmed scripted request generates the complete working package developers will receive: deterministic identity, publishable metadata, neutral Starter behavior, playground, SSR fixture test, truthful documentation, and package-local commands.

**Blocked by:** 08 — Establish the Scaffolder transaction seam

**Status:** ready-for-agent

**Spec:** [Repository-owned Nuxt module scaffolder](../spec.md)

- [ ] The production registry exposes Nuxt module as its single Template kind and routes it through the existing Scaffolder transaction.
- [ ] Canonical validation accepts only names beginning with a lowercase letter and containing lowercase letters, digits, and single hyphens, with a maximum length of 80 and no silent normalization.
- [ ] The `api-2-client` contract derives the exact destination, scoped package, Nuxt module name, configuration key, runtime injection, display name, playground identity, fixture identity, and default Starter message approved by the spec.
- [ ] The generated package has exactly the required license, README, manifest, TypeScript configuration, module source, runtime plugin, playground, basic test, and private consumer-fixture roles.
- [ ] No package-local lint, format, or Vitest configuration, Playwright or coverage setup, handwritten server TypeScript configuration, changelog, release script, nested workspace, nested lockfile, or package-local ignore file is generated.
- [ ] Publication metadata is ESM, starts at version `0.0.1`, requires Node 26, uses the fixed public `@dphonys` scope and repository metadata, exposes Module Builder output and types, and packages only the distribution.
- [ ] A non-empty description is trimmed and rendered truthfully; a blank description is absent rather than replaced with invented text.
- [ ] The injected year produces the standard MIT license attribution to Daniel Petr Honys.
- [ ] The module exports typed optional message configuration, declares Nuxt `>=4.0.0`, applies the generated default, stores it in name-prefixed public runtime configuration, and registers the runtime plugin.
- [ ] The runtime plugin exposes the configured message through the generated name-prefixed injection.
- [ ] The playground consumes the workspace package, enables DevTools, uses the latest compatibility date, and renders the display name with the default Starter message.
- [ ] The consumer fixture imports module source, supplies a distinct override, renders the generated injection, and the Nuxt Test Utils test asserts that exact SSR output.
- [ ] The README documents installation, registration, configuration, option and injection use, repository-local development, and MIT licensing without fabricated features or publication claims.
- [ ] Exactly three Handoff markers appear at the module behavior, runtime behavior, and README customization points.
- [ ] Package commands support prepared development, playground build, Nuxt-aware source and playground type checking, inherited linting, Vitest, Module Builder distribution output, and build-before-`publint`.
- [ ] Generated dependencies use the shared catalog with `@nuxt/kit` as the sole runtime dependency and the approved development dependency roles.
- [ ] Structural and semantic tests cover the exact required output, forbidden output, both description cases, fixed year, all derived identities, metadata, Template tokens, named structured mutation, and Template-specific validation without maintaining a full-file golden package.
