# Establish the current Nuxt 4 module baseline

Type: research
Status: resolved

## Question

What exact package structure, compatibility declaration, dependency set, build tooling, playground setup, test tooling, package metadata, and version constraints do current official Nuxt 4 module-authoring sources recommend for a production-ready module in a pnpm monorepo, and which parts of `module-template:packages/scroll-restorer` should be retained, updated, or removed?

## Research artifact

Write the findings to `../research/current-nuxt-4-module-baseline.md`, citing primary sources next to the claims they support.

## Answer

Use the current official Nuxt module starter as the structural baseline, adapted to this pnpm monorepo: ESM output through `@nuxt/module-builder`, explicit Nuxt `>=4.0.0` compatibility, current Nuxt 4.5-era dependency ranges, one working playground, one real `@nuxt/test-utils` consumer-fixture test, repo-owned lint/format/release tooling, and build-before-`publint` verification. Retain the proven module/runtime/playground/export shape from `module-template`, but replace product-specific code and stale dependencies, and remove empty Playwright, coverage, manual server-tsconfig, package-local formatting, and release scaffolding. Full evidence and the exact retain/update/remove matrix are in [Current Nuxt 4 module baseline](../research/current-nuxt-4-module-baseline.md).
