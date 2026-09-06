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

## Handler Packages

This context names the concepts shared across the handler packages (`nuxt-handler-errors`, `nuxt-handler-validation`, and the umbrella that composes them). Each package README is the authority for its own terms; only cross-package terms live here.

### Language

**Handler**:
A Nitro route handler produced by one of the repository's `define…EventHandler` wrappers; always a plain h3 `EventHandler`.
_Avoid_: Endpoint, route function

**Known error**:
A failure a Handler selects from reusable error declarations and raises through a local Error factory; typed at every call site from the route path.
_Avoid_: Expected error, business error

**Error declaration**:
A named failure contract with a tag, an HTTP error status and an optional Error payload; reusable individually or as part of an Error group.
_Avoid_: Error record, registry entry

**Error group**:
A reusable collection of Error declarations from which a Handler may select all or a subset of its Known errors.
_Avoid_: Registry, namespace

**Error factory**:
A Handler-local function that synchronously creates a throwable for one selected Error declaration; any payload validation must finish before it leaves the Handler as a Known error.
_Avoid_: Fail helper, error raiser

**Error payload**:
The fields of a Known error beside its tag and status. A schema-backed payload validates input and supplies transformed output; a declaration without a payload carries no fields beyond its tag and status.
_Avoid_: Nested data, response envelope

**Validation source**:
One of the four request inputs a Handler may validate: `routerParams`, `query`, `headers`, `body`.
_Avoid_: Input, field

**Validated context**:
The Handler's second parameter: output-typed validated values, one key per declared Validation source, undeclared sources absent.
_Avoid_: Parsed request, payload

**Handler context**:
The Umbrella Handler's second parameter: the Validated context's keys plus `errors` factories when Known errors are declared; the door to validated values and to creating a Known error.
_Avoid_: Context object, helpers, second argument

**Built-in validationFailed variant**:
The Known error every Umbrella route implicitly carries when it declares any Validation source, always on, carrying the rejected source's issues; call sites handle input rejection with a typed arm, and it is recognised both as a Known error and as a validation failure.
_Avoid_: Validation error, 400

**Reserved tag**:
A Known-error tag the Umbrella keeps for itself (`validationFailed`) and refuses in any route's declared errors, whether or not that route validates.
_Avoid_: Built-in tag, system error

**Checked fetch family**:
The fetch composables and globals that carry a route's Known-error union to the call site (`useCheckedFetch`, `$checkedFetch.try`, and their siblings).
_Avoid_: Safe fetch

**Request typing**:
Typing a fetch call's `body` and `query` options per `(route, method)` from the route's Request input; compile-time only. A source is typed when the route declares it, required when sending nothing would fail validation, and otherwise exactly what the vanilla fetch accepts.
_Avoid_: Client validation, request schema

**Request input**:
The shape a client must send for a route, per Validation source: the declared schemas' _input_ types, with a composed tuple's inputs intersected. What Request typing reads; distinct from the Validated context, which is the output side.
_Avoid_: Validation input, request schema

**Declared source**:
A Validation source present in a route's Request input. Request typing applies per Declared source; an undeclared source is untouched, whatever else the route declares.
_Avoid_: Branded source, validated field

**Typed fetch family**:
The Umbrella's mirror of the Checked fetch family (`useTypedFetch`, `$typedFetch` and siblings): carries both the route's Known-error union and its Request typing to the call site.
_Avoid_: Better fetch, umbrella fetch

**Parent package**:
`nuxt-handler-errors` or `nuxt-handler-validation`: standalone modules that also expose an Internals entry.
_Avoid_: Base package, core package

**Umbrella**:
The composed module (`nuxt-typed-handler`) built on both Parent packages' Internals entries; installed instead of the parents, never alongside.
_Avoid_: Aggregator, meta-package

**Internals entry**:
A Parent package's side-split package entries (`/internals/build`, `/internals/server`, `/internals/app`, `/internals/shared`) exposing the pieces the Umbrella composes; versioned with the Umbrella (which pins the Parent package exactly) rather than by the Parent package's semver, documented for the Umbrella only, never for app authors.
_Avoid_: Core, private API

**Module layer**:
The thin `src/module.ts` of a package: auto-imports, templates, plugins; Nuxt wiring rather than logic.
_Avoid_: Setup, plugin
