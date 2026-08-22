# Internals contract

The `internals/*` entries are the seams `@dphonys/nuxt-typed-handler` composes
its own module from. They are **not for application code**: nothing here is
auto-imported or needed to use the package on its own, and their API is
documented only in this file - the README merely links here. Applications use
`.`, `/types`, `/server` and `/shared` only.

## Versioning posture

The internals are **not** covered by this package's semver. They are versioned
with `@dphonys/nuxt-typed-handler`, which pins this package to an **exact**
version (`"@dphonys/nuxt-handler-errors": "x.y.z"`, bumped in lockstep from the
workspace) and is the only supported consumer. Renaming, removing or reshaping
a name below is therefore an ordinary change here, released together with the
umbrella that absorbs it; it is never a major for application code, which
cannot reach these entries through any supported door. An application importing
them gets no support for doing so.

## Consuming from a module layer

A module layer composing these entries must:

- Depend on this package as a regular `dependency`, not a peer, pinned exactly.
  The foreign-copy guard in `resolveDeclared` is a per-instance `Symbol`, so
  every handler and every `defineError` value must resolve to the one
  `dist/runtime/server/lib/declared.js`; pnpm's dedupe does the rest as long
  as the pin matches what the parent's own `/server` entry resolves.
- Push this package onto `nuxt.options.build.transpile`. Nuxt transpiles only
  the packages listed in `modules`; the umbrella is installed _instead of_ the
  parent, so the parent is never listed, and `/internals/app` (which imports
  `#app`) would otherwise be externalised by the Vite SSR and Nitro builds. A
  workspace playground hides this - linked packages are never externalised -
  so prove it against a packed tarball.
- Own its own `#<name>/channel-token` binding: one getter-backed
  `CheckedFetchFactoryOptions`, one `wrapVanillaFetch` call, and a one-line
  error handler over `createChannelStripHandler`, each reading the alias
  `addChannelToken(nuxt, name, token)` returns.

## Entries

### `@dphonys/nuxt-handler-errors/internals/build`

`src/internals/build.ts`, bundled by rollup through `build.config.ts`.
Build-time only: it imports `@nuxt/kit` freely and never reaches a runtime
bundle.

| Export                                                  | One line                                                                                                                   |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `emitMap(handlers, options)`                            | Renders the generated route map: banner, merged type imports, one `declare module` block per slot, `export {}`.            |
| `emptyMap(options?)`                                    | The map with no routes, one empty interface per slot.                                                                      |
| `EMPTY_MAP`                                             | `emptyMap()` with the default slot.                                                                                        |
| `KNOWN_ERRORS_SLOT`                                     | This package's slot: `KnownApiErrors` in `TYPES_SPECIFIER`, extracted with `Simplify<Serialize<KnownErrorsOfHandler<…>>>`. |
| `TYPES_SPECIFIER`                                       | `'@dphonys/nuxt-handler-errors/types'`, the specifier the default slot augments.                                           |
| `normalizeChannelToken(channelToken, name)`             | `false` to `undefined` silently; `''` to `undefined` with a `[<name>]` warning; a string passes through.                   |
| `addChannelToken(nuxt, name, token)`                    | Writes `<name>/channel-token.mjs` and aliases `#<name>/channel-token` on Nuxt and Nitro; returns the alias specifier.      |
| `addChannelStripErrorHandler(nuxt, token, handlerPath)` | No-op without a token; otherwise prepends `handlerPath` to Nitro's `errorHandler` chain, keeping every existing entry.     |
| `warnCustomErrorHandler(nuxt, name)`                    | The `nitro.errorHandler !== undefined` warning, prefixed `[<name>]`.                                                       |
| `EmitMapOptions`                                        | `{ nitroOptions, slots?, generatedBy? }`; `slots` defaults to `[KNOWN_ERRORS_SLOT]`, `generatedBy` to this package's name. |
| `EmitMapSlot`                                           | One `declare module` block made data: `interfaceName`, `specifier`, `imports`, `extract`.                                  |
| `SlotImport`                                            | One `import type { names } from 'from'` a slot's extractor needs; merged across slots on emit.                             |
| `NitroPathOptions`                                      | `Pick<Nitro['options'], 'alias' \| 'buildDir' \| 'srcDir'>`, what `emitMap` resolves handler paths against.                |

`handlerPath` is a parameter because the strip handler reads the token through
the _caller's_ alias; each module layer owns a one-line handler over
`createChannelStripHandler`.

### `@dphonys/nuxt-handler-errors/internals/server`

`src/runtime/internals/server/index.ts`, copied by mkdist. Nitro side.

| Export                                     | One line                                                                                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `resolveDeclared(errors)`                  | Foreign-copy guard plus first-occurrence-wins dedupe at declaration; throws the verbatim `is not an error created by this copy of the module` message. |
| `createFail(declared)`                     | `fail` scoped to `declared`: a declared tag raises a marked `H3Error`, an undeclared one throws a plain `Error`.                                       |
| `createKnownError(tag, status, fields)`    | The unthrown known-error `H3Error`: `statusCode`, `message === tag`, `data` carrying the marker, no `statusMessage`.                                   |
| `raiseKnown(tag, status, fields)`          | `throw createKnownError(…)`.                                                                                                                           |
| `createCheckedEventFetch(getBase, token?)` | The event-scoped `$checkedFetch` the server auto-import is built on; `getBase` reads the event's `$fetch` lazily.                                      |
| `EventFetchUnavailableError`               | Thrown when `getBase` yields no `$fetch`.                                                                                                              |
| `createChannelStripHandler(getToken)`      | The Nitro error handler that strips the marker off responses lacking the channel header; `getToken(event)` reads the caller's token.                   |
| `DeclaredError`                            | `{ tag, status }`, what `resolveDeclared` returns and `createFail` consumes.                                                                           |
| `RawEventFetch`                            | The loose event-fetch shape `createCheckedEventFetch` accepts.                                                                                         |

### `@dphonys/nuxt-handler-errors/internals/shared`

`src/runtime/internals/shared/index.ts`, copied by mkdist. Isomorphic.

| Export                                  | One line                                                                                                              |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `createCheckedFetch(base, options)`     | The `$checkedFetch` factory with the token injected as a value; returns the typed public `$CheckedFetch` shape.       |
| `lazyGlobalFetch`                       | A `RawFetch` proxy over `globalThis.$fetch` read at call time, so a module layer can build its global at plugin time. |
| `toNuxtError(cause)`                    | h3's `createError` normalisation plus `status`/`statusText` getters, the shape the matcher reads.                     |
| `toTryResult(call)`                     | Runs `call` and folds the outcome into a `RawTryResult`.                                                              |
| `knownErrorMarker(tag, status, fields)` | The wire marker placed under `KNOWN_ERROR_KEY`.                                                                       |
| `readFloor(error)`                      | The marker's variant off any error-shaped value, or `undefined`.                                                      |
| `CHANNEL_HEADER`                        | `'x-known-error-channel'`.                                                                                            |
| `CheckedFetchFactoryOptions`            | `{ token, instanceHeaders? }`; `token` is read on every call, so a binding may hand in a getter over a live import.   |
| `RawFetch`, `RawOptions`                | The loose `$fetch` shape (`call`, `raw`, `create`, `native`) and its options.                                         |
| `RawTryResult`                          | `TryResult<unknown, NuxtError>`.                                                                                      |

### `@dphonys/nuxt-handler-errors/internals/app`

`src/runtime/internals/app/index.ts`, copied by mkdist. App side: imports
`#app` and `vue`, so it resolves only inside a Nuxt build.

| Export                                   | One line                                                                                                                                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wrapVanillaFetch(vanilla, options)`     | Vanilla `useFetch` (or its lazy twin) with the checked header merge laid over it; returns the loose `RawUseFetch`.                                                                                       |
| `wrapVanillaAsyncData(vanilla)`          | Vanilla `useAsyncData` (or its lazy twin) over a `try`-shaped source: a failed result is rethrown so vanilla's `error` ref carries it, a success unwraps to `data`; returns the loose `RawUseAsyncData`. |
| `FetchWrapperOptions`                    | `{ token }`; read on every call, as for `CheckedFetchFactoryOptions`.                                                                                                                                    |
| `RawUseFetch`, `RawUseAsyncData`         | The loose runtime shapes; the module layer that binds them applies its own signature with one cast.                                                                                                      |
| `UseCheckedFetch`, `UseCheckedAsyncData` | This package's composable signatures, exported for reference; a composing module's own signatures differ.                                                                                                |
| `KnownErrorRef`                          | The `error` ref type `useCheckedFetch` returns for a route and method.                                                                                                                                   |
| `TrySource`, `SuccessOf`, `FailureOf`    | The `try`-result source shape and its two projections.                                                                                                                                                   |

## Layering rules

`test/unit/layering.test.ts` walks each entry's import graph over `src/` and
asserts that no forbidden bare specifier is reached:

| Entry                                   | Must not reach                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| `src/runtime/server/index.ts`           | `@nuxt/kit`                                                                    |
| `src/runtime/internals/server/index.ts` | `@nuxt/kit`, `#app`, `#nuxt-handler-errors/channel-token`                      |
| `src/runtime/internals/shared/index.ts` | `@nuxt/kit`, `nitropack/runtime`, `#app`, `#nuxt-handler-errors/channel-token` |
| `src/runtime/internals/app/index.ts`    | `@nuxt/kit`, `nitropack/runtime`, `#nuxt-handler-errors/channel-token`         |
| `src/internals/build.ts`                | `#nuxt-handler-errors/channel-token`                                           |

The alias row is the rule of thumb made executable: a file that imports
`#nuxt-handler-errors/channel-token` is a parent binding, a file that takes the
token as a value is an internal. `/internals/shared` may import `h3`:
`toNuxtError` _is_ h3's `createError`, and rewriting it h3-free would change the
`NuxtError` shape consumers match on.

## Keeping the doors apart

`test/e2e/package-entries.test.ts` resolves all eight entries from the
playground's `node_modules` (types for every entry; runtime for all but
`/internals/app`, whose `#app` import exists only inside a Nuxt build), probes
every name above through the door that owns it, and proves the internals are
not importable from `.`, `/server` or `/shared`.
