# Internals contract

The `internals/*` entries are the seams `@dphonys/nuxt-typed-handler` composes
its own module from. They are **not for application code**: nothing here is
auto-imported or needed to use the package on its own, and their API is
documented only in this file - the README merely links here. Applications use
`.`, `/types` and `/server` only.

## Versioning posture

The internals are **not** covered by this package's semver. They are versioned
with `@dphonys/nuxt-typed-handler`, which pins this package to an **exact**
version (`"@dphonys/nuxt-handler-validation": "x.y.z"`, bumped in lockstep from
the workspace) and is the only supported consumer. Renaming, removing or
reshaping a name below is therefore an ordinary change here, released together
with the umbrella that absorbs it; it is never a major for application code,
which cannot reach these entries through any supported door. An application
importing them gets no support for doing so.

## Consuming from a module layer

A module layer composing these entries must:

- Depend on this package as a regular `dependency`, not a peer, pinned exactly.
  The marker key is `Symbol.for('...')`, so a marked error is recognised across
  copies; the exact pin is about shipping one tested pair, not about identity.
- Own its own `onInvalid`: every client-input rejection - a rejecting schema
  and the unparseable-body case alike - reaches the `OnInvalid` passed to
  `validatedContext`, with projected `ValidationIssue[]`, and the hook must not
  return. The developer-mistake `500`s and the not-a-schema route-evaluation
  `Error` never reach it. A layer that wants this package's own `400` passes no
  options; `raiseValidationError` is the default.
- Push **nothing** onto `nuxt.options.build.transpile`. No entry here imports
  `#app` or any other Nuxt alias, so both entries bundle unchanged whether or
  not the package is listed in `modules`.

## Entries

### `@dphonys/nuxt-handler-validation/internals/server`

`src/runtime/internals/server/index.ts`, copied by mkdist. Nitro side: may
import `h3`.

| Export                                    | One line                                                                                                                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sourcePlan(schemas)`                     | Route-evaluation resolution of a `ValidationSchemas` value into one `SourcePlan` per declared source, in walk order; a not-a-schema slot throws a plain `Error` here, not later. |
| `validatedContext(event, plan, options?)` | One request through the plan, fail-fast in plan order; returns the loose record the caller casts to `ValidatedContext<S>` at its own seam.                                       |
| `raiseValidationError(source, issues)`    | The default `onInvalid`: the marked h3 `400` (`statusMessage: 'Validation Error'`, `message: 'Validation failed for <source>'`, `data: { issues }`), byte-identical wire.        |
| `OnInvalid`                               | `(source, issues) => never`; receives projected issues, all from one source.                                                                                                     |
| `SourcePlan`                              | One resolved source slot: `source`, its reader and its schema list. Pass it through unchanged.                                                                                   |
| `ValidatedContextOptions`                 | `{ onInvalid? }`; defaults to `raiseValidationError`.                                                                                                                            |

Raw Standard Schema issues never cross this seam: the raw-to-projected split
(`projectIssues`) is re-exported by no entry, so an `onInvalid` hook sees
only `source`, `message` and `path`.

### `@dphonys/nuxt-handler-validation/internals/shared`

`src/runtime/internals/shared/index.ts`, copied by mkdist. Isomorphic.

| Export                               | One line                                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `markValidationError(error, issues)` | Places a copy of `issues` under `VALIDATION_ERROR_KEY` on the `H3Error`'s `data`, the marker `recognizeValidationError` reads. |
| `readValidationMarker(error)`        | The `ValidationErrorData` off any error-shaped value, or `undefined`.                                                          |
| `VALIDATION_ERROR_KEY`               | The marker key, a `Symbol.for` so every copy of this package recognises an error another copy marked.                          |

## Layering rules

`test/unit/layering.test.ts` walks each entry's import graph over `src/` and
asserts that no forbidden bare specifier is reached:

| Entry                                   | Must not reach                           |
| --------------------------------------- | ---------------------------------------- |
| `src/runtime/server/index.ts`           | `@nuxt/kit`                              |
| `src/runtime/internals/server/index.ts` | `@nuxt/kit`, `#app`                      |
| `src/runtime/internals/shared/index.ts` | `@nuxt/kit`, `nitropack/runtime`, `#app` |

`h3` is not on the shared row: `error-marker.ts` imports only its `H3Error`
type, the runtime bundle carries no h3 code, and the walker does not tell a
type import from a value one.

## Keeping the doors apart

`test/e2e/package-entries.test.ts` resolves all five entries from the
playground's `node_modules` for both runtime and types, probes every name above
through the door that owns it, and proves `sourcePlan`, `validatedContext`,
`raiseValidationError` and `markValidationError` are not importable from `.` or
`/server`.
