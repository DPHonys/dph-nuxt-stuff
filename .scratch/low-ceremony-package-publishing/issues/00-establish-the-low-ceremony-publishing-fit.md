# Establish the low-ceremony publishing fit

Type: research
Status: resolved
Assignee: release_research

## Question

What is the smallest reliable way to develop, independently version, publish, and consume this repository's Nuxt packages, given the current repository and maintained Nuxt ecosystem precedents?

## Research artifact

[Current pnpm-native package publishing](../research/current-pnpm-native-package-publishing.md)

## Answer

Use pnpm 11's native independent release flow: `pnpm change` records release intent, `pnpm version -r` applies independent versions and dependent propagation, a maintainer reviews and commits the result, and one GitHub Actions workflow runs the canonical check followed by OIDC-authenticated `pnpm publish -r`.

The fixed-version `bumpp` pattern used by tightly coupled Nuxt suites would republish unrelated modules unnecessarily. Changelogen and release-it fit one package or synchronized releases better. pnpm already supplies the required independent versioning behavior in the repository's pinned toolchain, and its change-intent format leaves a future move to Changesets automation open if team scale eventually warrants it.
