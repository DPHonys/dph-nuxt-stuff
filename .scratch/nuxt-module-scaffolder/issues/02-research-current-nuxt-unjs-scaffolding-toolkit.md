# Choose the current Nuxt and UnJS scaffolding toolkit

Type: research
Status: resolved

## Question

Which current first-party Nuxt/UnJS packages and APIs should power an interactive repository-local scaffolder—covering command definition, prompts, naming transforms, path/file operations, structured TypeScript/JSON mutation, package-manager execution, logging, and cancellation—and what are the supported roles and limitations of Citty and Magicast in that design?

## Research artifact

Write the findings to `../research/current-nuxt-unjs-scaffolding-toolkit.md`, citing primary sources next to the claims they support.

## Answer

Use Citty for the stable command boundary; direct `@clack/prompts` for the interactive flow, validation, progress, and explicit cancellation; Scule for one canonical naming context; Pathe plus native `node:fs/promises` for repository-local paths and copying; pkg-types for JSON/TSConfig metadata; Magicast only for known static-ish TypeScript AST shapes; and nypm for the repository-root pnpm install. Clack logging is sufficient for this small guided tool, while Consola and an abort-aware tinyexec wrapper remain optional extensions. The detailed roles, limitations, cancellation behavior, and proposed orchestration are in [Current Nuxt/UnJS scaffolding toolkit](../research/current-nuxt-unjs-scaffolding-toolkit.md).
