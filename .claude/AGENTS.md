# dph-nuxt-stuff

A monorepo for Nuxt modules and plugins development.

## Architecture

```text
dph-nuxt-stuff/
├── packages/          # Publishable Nuxt modules and plugins
├── .github/
│   └── workflows/     # CI/CD: ci, autofix, release, semantic-pr
├── turbo.json         # Turborepo task pipeline
├── package.json       # Root workspace (pnpm)
├── tsconfig.json      # Base TypeScript config (strictest)
├── eslint.config.mjs  # @antfu/eslint-config (lib mode)
├── knip.config.ts     # Unused exports/deps detection
├── commitlint.config.ts
└── renovate.json
```

## Tech Stack

| Tool                                    | Purpose                                   |
| --------------------------------------- | ----------------------------------------- |
| **pnpm**                                | Package manager                           |
| **Turborepo**                           | Monorepo task orchestration               |
| **@antfu/eslint-config**                | Lint + format (no Prettier)               |
| **changelogen**                         | Changelog + release automation            |
| **Husky + commitlint**                  | Enforce conventional commits              |
| **Vitest**                              | Per-package (each package owns its tests) |
| **tsgo** (`@typescript/native-preview`) | Type checking (Go-based, fast)            |
| **TypeScript**                          | Peer dep for tooling (ESLint parser etc.) |
| **Renovate**                            | Automated dependency PRs                  |
| **publint**                             | Validate package exports before publish   |
| **pkg-pr-new**                          | Preview releases on PRs                   |
| **knip**                                | Dead code / unused dep detection          |

## Dev Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm run build

# Lint
pnpm run lint

# Lint and auto-fix
pnpm run lint:fix

# Type check
pnpm run typecheck

# Detect unused exports/deps
pnpm run knip

# Release (bumps version, generates changelog, tags, pushes, publishes)
pnpm run release
```

## Commit Convention

This repo enforces [Conventional Commits](https://www.conventionalcommits.org/) via commitlint + Husky.

```text
<type>(<scope>): <description>

Types: feat, fix, docs, chore, refactor, perf, test, ci, build
```

Examples:

- `feat(my-module): add auto-import support`
- `fix(my-plugin): handle undefined config`
- `chore: update dependencies`

## Adding a New Package

1. Create `packages/<your-package>/`
2. Add a `package.json` with `name`, `version`, and appropriate `exports`
3. Add a `src/` directory with your entry point
4. Run `pnpm install` from the root
5. Add `publint` to the package's dev deps and run it before publishing

## Release Process

Releases are handled by `changelogen`. It parses conventional commits, bumps the version, generates `CHANGELOG.md`, creates a git tag, pushes, and publishes to npm.

```bash
pnpm run release
```

You need an `NPM_TOKEN` secret in GitHub for the CI release workflow.

## CI

- **ci.yml** — lint + typecheck + preview releases (pkg-pr-new) on push/PR
- **autofix.yml** — auto-fixes lint issues and commits back
- **release.yml** — triggered manually or on `v*` tag push
- **semantic-pull-requests.yml** — validates PR title follows conventional commits
