# Repository Scaffolding

This context names the concepts used to create consistent workspace packages from repository-owned starting points.

## Language

**Scaffolder**:
The developer-facing tool that creates a new workspace package from a selected template kind.
_Avoid_: Generator, template script

**Template kind**:
A selectable category of package that the scaffolder can create. The initial template kind is Nuxt module.
_Avoid_: Project type, preset

**Template**:
The repository-owned source tree from which the scaffolder creates a package.
_Avoid_: Boilerplate, starter

**Generated package**:
A workspace package created by the scaffolder under the repository's packages collection.
_Avoid_: Project, output folder

**Starter behavior**:
The neutral, replaceable behavior included in every generated package to prove that module options reach a name-prefixed runtime injection and render through Nuxt SSR.
_Avoid_: Example feature, demo module

**Repository support**:
Shared workspace policy and capabilities that are installed once for all generated packages rather than rewritten by each scaffolding run.
_Avoid_: Template configuration, per-package setup

**Package-local contract**:
The files and commands a generated package owns independently while conforming to repository support.
_Avoid_: Root configuration

**Handoff marker**:
A deliberate TODO at a package-specific customization point, reminding its developer to replace starter behavior or documentation without making the generated package incomplete or broken.
_Avoid_: Placeholder, unfinished scaffold

**Scaffold name**:
The kebab-case name supplied once when creating a package and used as the source for its derived directory, package, module, configuration, and display names.
_Avoid_: Module name, package slug

**Acceptance fixture**:
A deterministic generated package created in a disposable repository to prove that the Scaffolder, repository support, and package-local contract work together without retaining a second golden copy of the Template.
_Avoid_: Golden package, example package

**Independent package release**:
A release that versions and publishes only the generated packages selected by their own changes, leaving every unaffected package at its existing version.
_Avoid_: Monorepo release, synchronized release

**Publishable package**:
A generated package intentionally admitted to publication by removing `private: true` after its Starter behavior and documentation are replaced.
_Avoid_: Publication candidate, ready package

**Publication boundary**:
The repository rule that only non-private direct children of `packages/*` may be versioned and published, provided they satisfy the Package-local contract.
_Avoid_: Package allowlist, publish list

**Release intent**:
A pnpm change-intent file committed with a consumer-visible change that names the affected packages, their semantic version increments, and their release notes.
_Avoid_: Version commit, conventional commit

**Dependency-only release**:
A downstream patch release created only because an internal dependency's new version falls outside the downstream package's declared range.
_Avoid_: Cascading release, synchronized bump

**Release commit**:
A maintainer-reviewed commit produced by `pnpm version -r` that records the exact package versions and changelogs authorized for publication.
_Avoid_: Release PR, version bump

**Canonical publication gate**:
The repository's complete validation rerun against a Release commit before publication.
_Avoid_: Prior CI result, release smoke test

**First-release bootstrap**:
The one-time authenticated publication that creates a new npm package name so its per-package trusted publisher can be registered for later OIDC releases.
_Avoid_: Normal release, package admission
