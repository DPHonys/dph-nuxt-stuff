# dph-nuxt-stuff

A pnpm monorepo for developing and publishing Nuxt modules and plugins under
the `@dphonys/*` scope. Packages are scaffolded from templates, versioned
independently with pnpm Release intents, and published through npm trusted
publishing.

## Repository layout

```text
dph-nuxt-stuff/
├── packages/          # Publishable Nuxt modules and plugins
├── templates/         # Template sources consumed by the Scaffolder
├── scaffolder/        # Interactive CLI that generates new packages
├── release/
│   ├── publishing-contract/   # Enforces the Publication boundary in every check
│   └── release-preparation/   # Executable spec of pnpm independent releases
├── docs/              # Release and bootstrap runbooks
└── .github/workflows/ # CI, publish, semantic PR checks
```

## Getting started

Node comes from `.nvmrc` and pnpm is pinned via `packageManager`:

```sh
nvm use
pnpm install
```

## Everyday commands

```sh
pnpm run build      # Build all packages (turbo)
pnpm run test       # Run every package's tests
pnpm run check      # Full canonical gate: contract, types, format, lint, tests, build, publint
pnpm run fix        # Auto-fix lint and formatting
pnpm run knip       # Detect unused files, exports, and dependencies
```

## Creating a package

Generate a new package interactively from a template:

```sh
pnpm scaffold
```

Generated packages start with `private: true` and a seeded `0.0.1` version.
They stay out of publication until a maintainer deliberately admits them by
removing `private: true` after the Starter behavior and documentation are
replaced — see [docs/first-release-bootstrap.md](docs/first-release-bootstrap.md).

## Releasing

Every consumer-visible change carries a pnpm Release intent:

```sh
pnpm change
```

Maintainers prepare a reviewed Release commit from all pending intents and,
once it reaches `main`, manually dispatch the `publish.yml` workflow. The
workflow reruns the canonical gate and publishes missing package versions with
npm trusted publishing and provenance — no tokens involved. The complete
procedure lives in [docs/release-preparation.md](docs/release-preparation.md).

## Conventions

- [Conventional Commits](https://www.conventionalcommits.org/) enforced by
  commitlint + Husky (`feat(scope): subject`).
- Only non-private direct children of `packages/*` may be published, and they
  must satisfy the package-local contract checked by
  `pnpm publishing-contract` as the first step of `pnpm check`.
- Shared terminology for the project's concepts is defined in
  [CONTEXT.md](CONTEXT.md).

## License

The repository itself is private tooling; published `@dphonys/*` packages
declare their own license (MIT) in their manifests.
