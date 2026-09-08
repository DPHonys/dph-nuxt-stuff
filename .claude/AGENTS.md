# dph-nuxt-stuff

A monorepo for Nuxt modules and plugins development.

## Architecture

```text
dph-nuxt-stuff/
├── packages/          # Publishable Nuxt modules and plugins
├── .github/
│   ├── actions/setup/ # Shared checkout, toolchain, cache, and install steps
│   └── workflows/     # CI/CD: ci, publish, semantic-pull-requests
├── turbo.json         # Turborepo task pipeline
├── package.json       # Root workspace (pnpm)
├── tsconfig.json      # Base TypeScript config (strictest)
├── eslint.config.ts   # Oxlint compatibility + Antfu conventions
├── commitlint.config.ts
└── renovate.json
```

## Tech Stack

| Tool                        | Purpose                                               |
| --------------------------- | ----------------------------------------------------- |
| **pnpm**                    | Package manager                                       |
| **Turborepo**               | Monorepo task orchestration                           |
| **Oxlint**                  | Fast correctness linting                              |
| **@antfu/eslint-config**    | Project conventions                                   |
| **Oxfmt**                   | Formatting and import order                           |
| **pnpm release management** | Independent Release intents, versions, and changelogs |
| **Husky + commitlint**      | Enforce conventional commits                          |
| **Vitest**                  | Per-package (each package owns its tests)             |
| **TypeScript**              | Stock TS 5 — the compiler consumers run               |
| **Renovate**                | Automated dependency PRs                              |
| **publint**                 | Validate package exports before publish               |
| **knip**                    | Dead code / unused dep detection                      |

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

# Check or fix formatting
pnpm run format
pnpm run format:fix

# Type check
pnpm run typecheck

# Run all code-quality checks
pnpm run check

# Detect unused exports/deps
pnpm run knip

# Record consumer-visible Release intent (a native pnpm command, not a script)
pnpm change

# Inspect and preview all pending Independent package releases
pnpm change status
pnpm version -r --dry-run
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

Scaffold it non-interactively with the repository Scaffolder:

```bash
pnpm scaffold --template nuxt-module --name <scaffold-name> --description "..."
```

`--description` is optional. The Scaffolder renders the template, runs
`pnpm install`, and formats the result; failures exit non-zero without
prompting. Run `pnpm scaffold` with no flags for the interactive prompts.

For a package shape no template covers:

1. Create `packages/<your-package>/`
2. Add a `package.json` with `name`, `version`, and appropriate `exports`
3. Add a `src/` directory with your entry point
4. Run `pnpm install` from the root
5. Add `publint` to the package's dev deps and run it before publishing

## Release Process

Consumer-visible package changes carry a pnpm Release intent. Maintainers
preview and apply every pending intent together, run the canonical check, and
review the resulting package versions, package changelogs, and consumed-intent
ledger before committing the result. See
[`docs/release-preparation.md`](../docs/release-preparation.md) for the complete
Release commit procedure.

After the reviewed Release commit reaches `main`, manually dispatch the
`publish.yml` workflow from `main`. It reruns the Canonical publication gate
before publishing missing package versions through npm trusted publishing.

## CI

- **ci.yml** — on push to `main` and on PRs. Runs the pieces of `pnpm check` as
  parallel jobs: publishing contract, format, lint, typecheck, knip, test, and
  build + publint. Lint failures land as inline PR annotations; test results
  land as a `Vitest` check with the junit summary.
- **publish.yml** — manual dispatch from `main` only. Reruns `pnpm check`, then
  publishes missing package versions through npm trusted publishing.
- **semantic-pull-requests.yml** — validates PR title follows conventional commits

`pnpm check` remains the single local gate and the publish gate. CI splits it
only so each failure reports on its own.
