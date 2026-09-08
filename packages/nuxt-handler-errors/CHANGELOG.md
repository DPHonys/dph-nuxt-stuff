# @dphonys/nuxt-handler-errors

## 0.6.0

### Minor Changes

- Error recognition takes an `Error`. `recognizeKnownError` and the degraded `matchError` overload accept a value already narrowed with `instanceof Error` or Nuxt's `isNuxtError`, instead of `unknown`; a bare `catch` value is narrowed at the call site first. `KnownErrorCarrier<E>` is now `NuxtError<KnownErrorBody<E>>`. The known-error wire marker is parsed with a schema, so `zod` becomes a runtime dependency of the errors module. The umbrella module re-exports the narrowed surface.

## 0.5.0

### Minor Changes

- Handler-local typed error factories: declare `{ errors: [...userErrors] }`, receive `{ errors }` in the handler context, and write `throw errors.conflict(input)`. `defineError` declares singles and groups; groups spread into the `errors` array and narrow with `.pick()`. Tags are kebab-case, such as `user-not-found`, checked at compile time and at declaration; each factory is the tag's camelCase form, `errors.userNotFound`.

  A definition's optional `payload` is a Standard Schema, validated synchronously when the factory is called; an asynchronous schema throws a `TypeError` from the factory. A factory takes the schema's input and the client receives its output as flat fields such as `e.email`, beside `tag` and `status`. A definition without `payload` yields a zero-argument factory. Invalid schema payloads answer an unmarked 500; a factory's result is a finished error to throw.

  The generated per-endpoint error maps, exhaustive matching, native success responses, and channel gating work over these declarations unchanged. The umbrella keeps its validated context properties and its built-in `validation-failed` variant.

### Patch Changes

- Declare `nuxt` as a peer dependency (`>=4.5.1 <5.0.0`), so the Nuxt range the readme already states is one the package manager checks as well.

## 0.4.0

### Minor Changes

- Adds the `/internals/build`, `/internals/server`, `/internals/shared` and `/internals/app` entries consumed by `@dphonys/nuxt-typed-handler`. They are not for application code and carry no new behaviour for apps; they are versioned with the umbrella, which pins this package exactly, and sit outside this package's semver. Incidentally public: `createKnownError` (the unthrown known-error product) on `/internals/server`, and `emitMap` now accepting `slots` and a `generatedBy` banner.

## 0.3.1

### Patch Changes

- The package now declares `sideEffects: false`. Nothing in the runtime tree runs
  at import time — the plugins, composables, and server helpers are all consumed
  through their exports — so a consumer's bundler may drop whatever an app does
  not reach. Previously the absence of the field forced every runtime file that
  was imported to be kept whole.

## 0.3.0

### Minor Changes

- The four server helpers — `defineCheckedEventHandler`, `defineError`, `payload`, and `recognizeKnownError` — are now auto-imported in the Nitro build, the same ambient position `defineEventHandler` holds. The `/server` subpath export is unchanged and remains the explicit door for code that auto-imports cannot reach (`shared/`, `imports.autoImport: false`). `defineError` was checked against h3, Nitro, and Nuxt before claiming the global name; none of them export it.

## 0.2.0

### Minor Changes

- The channel-gating opt-out is now `channelToken: false` instead of `''` — the option types as `string | false`. An empty string still collapses to the opt-out, so existing configs keep working, but it now warns at build time and suggests `false`. (`null` was considered and rejected: the options merge treats it as unset and would silently restore the default token.)

## 0.1.0

### Minor Changes

- Initial release. Declare a Nitro handler's expected failures once with `defineError` and `defineCheckedEventHandler`, and have every call site infer them from the route path alone: `useCheckedFetch`, `useCheckedAsyncData`, and `$checkedFetch` return typed success-or-failure results, and `matchError` handles failures with exhaustive arms. Includes server-to-server error propagation, request-aware fetching, and optional channel-gated responses via the `channelToken` module option.
