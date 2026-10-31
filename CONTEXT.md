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

## Better Handler

This context names the concepts of `@dphonys/better-handler`, the repository's handler module. The package README is the authority for its rules; these are the terms its code, tests and docs use.

### Language

**Handler**:
A Nitro route handler produced by `defineBetterEventHandler`; at runtime always a plain h3 `EventHandler`, typed as `BetterEventHandler`, which fills h3's `H3Event<Request>` slot with the declared `body` and `query` input types.
_Avoid_: Endpoint, route function

**Known error**:
A failure a route declares under its `errors` key and a Handler raises through the Fail helper or by throwing any value whose `_tag` is a declared tag; it goes out with the declared status and its Tagged error as the error body's `data`, and is typed at every call site from the route path, with the Known errors of every route key that matches the path.
_Avoid_: Expected error, business error

**Error declaration**:
One entry of a route's `errors` map: a tag as the key, any non-empty string literal, and `{ status, schema? }`, the status an integer from `400` to `599` and the optional Standard Schema whose _input_ type describes the fields beside `_tag`. Reused by object spread (`defineError(tag, entry)` returns a one-key map) and narrowed by `Pick`.
_Avoid_: Error record, registry entry, error group

**Tagged error**:
The value a Known error carries, `{ _tag, ...fields }`, its fields the declared schema's _input_ type: sent flat as the error body's `data`, the same to every caller, and read at a call site as one member of a union exhaustive on `_tag`.
_Avoid_: Marker, envelope, error payload

**Fail helper**:
The Handler-context function `fail(tag, fields)`, present when the route declares `errors`; it pairs a declared tag with fields of its schema's _input_ type at compile time, as the Respond helper pairs a status with a body, and returns an `Error` carrying `_tag` and the fields for the Handler to throw.
_Avoid_: Error factory, error raiser

**Reserved tag**:
A tag the package keeps for its built-in variants, `validation-failed` and `request-failed`; declaring either in any route's errors is a compile error and a declaration-time throw.
_Avoid_: Built-in tag, system error

**Built-in validation-failed variant**:
The Known error every route that declares `input` carries: `400` with `data: { _tag: 'validation-failed', issues }`, the issues of the one Validation source that failed. Call sites handle input rejection with a typed arm, and `recognizeKnownError` recognises it like any other Known error.
_Avoid_: Validation error, 400

**Request-failed variant**:
The member of every call site's error union, `{ _tag: 'request-failed', status, cause }`, for each failure that carries no Tagged error of the route: a network error, an abort, an undeclared status, a body that carries no Tagged error. The caller builds it; no route sends it.
_Avoid_: Unknown error, catch-all error

**Validation source**:
One of the four request inputs a Handler may validate: `route`, `query`, `headers`, `body`. Declared under the Handler's `input` key, which names the set rather than any one source.
_Avoid_: Field, request part

**Declared source**:
A Validation source present in a route's Request input. Request typing applies per Declared source; an undeclared source is untouched, whatever else the route declares.
_Avoid_: Branded source, validated field

**Validated context**:
The input side of the Handler context: output-typed validated values, one key per Declared source, undeclared sources absent, plus the Respond helper when the Response output is a status map.
_Avoid_: Parsed request, payload

**Handler context**:
The Handler's second parameter, flat and fresh per request: the Validated context's keys plus the Fail helper when the route declares `errors`; the only door to validated values.
_Avoid_: Context object, helpers, second argument

**Response output**:
A Handler's declared success shape: either a single schema (one `200` reply, returned plainly) or a status map from HTTP status (100 to 399) to schema, where `null` declares a bodiless status; a failure status is declared under `errors`, by tag. The Handler hands over the schemas' _input_ types. Production runs nothing on the response; a development server asserts the handed-over value against the declared schema and discards the result, so both send the same bytes. The client receives the schemas' _input_ types.
_Avoid_: Response schema, return type

**Respond helper**:
The Validated-context function a Handler with a status-map Response output must return through; it pairs one status literal, one of those declared, with a value of that status's shape - or with no value at all when the status is declared `null`, the only bodiless declaration - and rejects any other pairing, a union of statuses included, at compile time.
_Avoid_: Reply, send, status setter

**Request input**:
The shape a client must send for a route, per Validation source: the declared schemas' _input_ types, with a composed tuple's inputs intersected. What Request typing reads; distinct from the Validated context, which is the output side.
_Avoid_: Validation input, request schema

**Request typing**:
Typing a call's `body`, `query` and `headers` options per `(route, method)` from the Request input of the one route key Nitro serves for that method, the most specific that matches (an exact static key over one with params over a catch-all), while the Known-error union keeps every matching key's errors; compile-time only. A Declared source is required unless `{}` fits its input type, and an undeclared one is exactly what the vanilla fetch accepts. The Better fetch family is typed on every Nuxt 4; on Nuxt 4.6 and later, when the app sets `experimental.routeTypedFetch: true`, Nuxt's own `$fetch` and `useFetch` also type `body` and `query` through the Handler's `H3Event<Request>` slot. Nuxt reads records only there, so array, primitive and other non-record bodies and queries stay vanilla on that path, while the family types them.
_Avoid_: Client validation, request schema

**Better fetch family**:
`$betterFetch` with `.try`, `event.$betterFetch`, and the five composables (`useBetterFetch`, `useLazyBetterFetch`, `useBetterAsyncData`, `useLazyBetterAsyncData`, `useRequestBetterFetch`): Nuxt's fetch styles carrying a route's Request typing, its response and its Known-error union to the call site.
_Avoid_: Typed fetch, checked fetch

**Development check**:
One of the three assertions a development server runs, all behind the `devChecks` option, and a production build never: the handed-over response against its Response output, a Known error's fields against their declared schema (the fields alone first, then the whole Tagged error, so a strict schema passes without listing `_tag`), and a thrown `_tag` against the declared tags. Each discards its result and refuses only with a Developer fault.
_Avoid_: Response validation, runtime check

**Developer fault**:
A developer's mistake the package finds while serving a request, such as a Development check's refusal or a Fail helper handed an undeclared tag: a plain `500` with no `data`, so never a Known error, marked unhandled as any server bug is. Its `[better-handler]` sentence goes to the server log with its stack and to a development client; a production client gets Nitro's generic `500`, `Server Error`.
_Avoid_: Internal error, misuse error

**Module layer**:
The thin `src/module.ts`: the `betterHandler` config key and its `devChecks` option, auto-imports, plugins and the type template; Nuxt wiring rather than logic.
_Avoid_: Setup, plugin
