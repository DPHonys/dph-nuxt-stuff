# Open Source Project Maintenance Findings

Analysis of 6 open source repositories: **jiti**, **nitro**, **nuxt**, **nuxt-module**, **nuxt-open-fetch**, **oidc-spa**.

---

## Package Manager

- **5/6 use pnpm** (only `oidc-spa` uses yarn)
- Pin exact version via `packageManager` field in `package.json`
- Use `pnpm-workspace.yaml` for monorepo packages

Common `.npmrc` settings:
```ini
shamefully-hoist=true       # nuxt-module, nuxt-open-fetch
shell-emulator=true         # jiti, nuxt-module
strict-peer-dependencies=false  # nuxt-open-fetch
```

---

## Changelogs & Versioning

[**changelogen**](https://github.com/unjs/changelogen) is the standard across jiti, nitro, nuxt, nuxt-open-fetch:

```json
"release": "changelogen --release --push --publish"
```

- Auto-generates `CHANGELOG.md` from conventional commits
- Bumps version, tags, pushes, and publishes in one command
- `nuxt-module` uses [**bumpp**](https://github.com/antfu/bumpp) as a simpler alternative

---

## Commit Conventions

All repos follow **conventional commits**. No commitlint config is enforced — they trust contributors. `changelogen` parses commit messages automatically to generate changelogs.

---

## Linting & Formatting

[@antfu/eslint-config](https://github.com/antfu/eslint-config) or the unjs variant `eslint-config-unjs` is the unanimous standard. Modern **flat config** format (`eslint.config.mjs`):

```js
// eslint.config.mjs
import { createConfigForNuxt } from '@nuxt/eslint-config/flat'
```

- No separate Prettier config needed — antfu's config includes formatting rules
- Minimal `.prettierrc` (`{}`) when Prettier is used alongside
- **nitro** is the outlier: uses [**oxlint**](https://oxc.rs/docs/guide/usage/linter) (Rust-based, ~100x faster) + oxfmt

---

## TypeScript

- All repos have `tsconfig.json`
- Large projects (nitro) use `tsgo` for faster type checking
- `vue-tsc` for Vue component type checking in nuxt projects

---

## Testing

**Vitest** is used across all 5 JS-heavy repos. Coverage via `v8`. Config in `vitest.config.ts`.

Notable setups:
- **nitro**: tests multiple build variants (rollup, rolldown, vite7)
- **nuxt**: multiple vitest "projects" (unit, fixtures, e2e via Playwright)
- **oidc-spa**: no vitest — uses a custom build-focused test process

---

## CI/CD

`.github/workflows/ci.yml` + `autofix.yml` is the standard pair (jiti, nitro):

- `ci.yml` — lint + typecheck + test on push/PR to `main`
- `autofix.yml` — auto-fixes lint issues on PRs

**nuxt** has 26 workflow files including:
- `semantic-pull-requests.yml`
- `stale.yml`
- `dependency-review.yml`
- `ecosystem-ci.yml`
- Issue/PR automation workflows

Other patterns:
- Multi-OS matrix (Ubuntu + Windows) for critical projects
- Canary/nightly releases on main push (jiti)
- Path-based CI filtering to skip unchanged packages (nuxt)

---

## Git Hooks

**Almost none of the modern repos use Husky.** Only `oidc-spa` uses legacy Husky v4 + lint-staged. Professional UnJS/Nuxt projects skip pre-commit hooks entirely and rely on CI instead.

---

## Code Quality Tools

| Tool | Used by | Purpose |
|------|---------|---------|
| `renovate` | jiti, nitro, nuxt | Automated dependency update PRs |
| `knip` | nuxt | Detect unused exports and dependencies |
| `publint` | nuxt-module | Validate `package.json` exports |
| `pkg-pr-new` | nuxt | Preview releases on PRs |
| `oxlint` | nitro | Fast Rust-based linter |

Renovate config pattern (low-config):
```json
{
  "extends": ["github>unjs/renovate-config"]
}
```

---

## AI / Automation Files

**jiti** and **nitro** both have `AGENTS.md` + `CLAUDE.md` — an emerging pattern in the UnJS ecosystem:

- `AGENTS.md` — comprehensive project guide (architecture, dev commands, testing, contributing)
- `CLAUDE.md` — contains only `@AGENTS.md` (redirects Claude Code to the agents file)

---

## Contributing & Community

- `CONTRIBUTING.md` — nuxt-module links to [antfu/contribute](https://github.com/antfu/contribute)
- `.github/ISSUE_TEMPLATE/` — bug report + feature request templates (nuxt, nitro)
- `.github/pull_request_template.md` — nuxt-module includes `/publish` comment trigger for `pkg-pr-new` previews

---

## Release Process

Standard pattern from jiti/nitro:

```yaml
# .github/workflows/release.yml
- run: changelogen --release --push --publish
```

Or as an npm script:
```json
"release": "pnpm build && changelogen --release --push && pnpm publish -r"
```

---

## Node Version Management

- `.nvmrc` files used by jiti, nitro, nuxt-module
- Values are either pinned (`22.12.0`) or track LTS (`lts/*`)

---

## Per-Repo Summary

| | jiti | nitro | nuxt | nuxt-module | nuxt-open-fetch | oidc-spa |
|---|---|---|---|---|---|---|
| Package manager | pnpm | pnpm | pnpm | pnpm | pnpm | yarn |
| Monorepo | no | yes | yes | yes | yes | no |
| Changelog tool | changelogen | changelogen | changelogen | bumpp | changelogen | custom |
| ESLint config | eslint-config-unjs | oxlint | @nuxt/eslint-config | @antfu | @antfu | prettier only |
| Testing | vitest | vitest | vitest + playwright | vitest | vitest | build script |
| Renovate | yes | yes | yes | no | partial | no |
| Git hooks | no | no | no | no | no | husky v4 |
| AGENTS.md | yes | yes | no | no | no | no |
| pkg-pr-new | no | no | yes | no | no | no |
| publint | no | no | no | yes | no | no |

---

## Recommended Stack for a New Nuxt/Nitro/Vite OSS Monorepo

| Category | Tool | Notes |
|----------|------|-------|
| Package manager | `pnpm` + workspaces | Ecosystem standard |
| Changelog/release | `changelogen` | UnJS-native, parses conventional commits |
| Linting + formatting | `@antfu/eslint-config` or `eslint-config-unjs` | One tool for both |
| Type checking | `typescript` + `vue-tsc` | Standard |
| Testing | `vitest` | Universal, fast |
| Dependency updates | `renovate` extending `github>unjs/renovate-config` | Low-config |
| Package validation | `publint` | Catches bad exports before publishing |
| Preview releases | `pkg-pr-new` | Great contributor DX |
| AI docs | `AGENTS.md` + `CLAUDE.md` | Emerging UnJS pattern |
| CI | `ci.yml` + `autofix.yml` | Standard pair |
| Git hooks | skip | Trust CI instead |
| Commit format | conventional commits | Required by changelogen |
| Node version | `.nvmrc` with `lts/*` or pinned | Consistency across contributors |
