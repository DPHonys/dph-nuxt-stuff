# to-delete

Everything here is no longer needed and can be deleted whenever convenient.
It is out of the pnpm workspace and excluded from typecheck, lint, format and
knip — nothing in the repo depends on it.

| Entry | What it was |
| ----- | ----------- |
| `nuxt-handler-errors-old/` | The v1 implementation, kept as reference during the v2 rewrite. Superseded by `packages/nuxt-handler-errors`. |
| `nuxt-known-errors/` | The v2 design sandbox (`DESIGN.md`, `INTERNALS-ANALYSIS.md`, type-only `sandbox/`). The design is implemented; the full design log stays in these files' git history. |
| `IMPLEMENTATION.md` | The rewrite's phase-plan / orchestration bookkeeping file. |
