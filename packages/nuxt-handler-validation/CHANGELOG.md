# @dphonys/nuxt-handler-validation

## 0.2.0

### Minor Changes

- Adds the `/internals/server` and `/internals/shared` entries consumed by `@dphonys/nuxt-typed-handler`. They are not for application code and carry no new behaviour for apps; they are versioned with the umbrella, which pins this package exactly, and sit outside this package's semver. Incidentally public on `/types`: the request-input family (`InputOf`, `MergedInput`, `SourceInput`, `RequestInput`), `ValidatedEventHandler` (what `defineValidatedEventHandler` now returns - a subtype of the previous `EventHandler`), `RequestInputOfHandler`, and the previously internal `ValidationSchemasGuard` / `ValidationDeclarationError`.

## 0.1.1

### Patch Changes

- The package now declares `sideEffects: false`. Nothing in the runtime tree runs
  at import time — the handler factory, the source and issue helpers, and the
  shared error marker are all consumed through their exports — so a consumer's
  bundler may drop whatever an app does not reach. Previously the absence of the
  field forced every runtime file that was imported to be kept whole.

## 0.1.0

### Minor Changes

- Initial release. Declare a Nitro handler's request schemas once with `defineValidatedEventHandler({ validate }, handler)`, and receive the validated values - typed as each schema's output - in the handler's second parameter. All four sources (`routerParams`, `query`, `headers`, `body`) accept any Standard Schema library and validate before the handler body runs, fail-fast in a guaranteed order. Reuse is exporting a schema value and composition is writing a tuple: a source slot takes a schema, or a tuple of schemas whose outputs merge, under two compile-time rules reported at the offending source key - every composed output must be an object, and their keys must be disjoint. Failures answer `400` with one fixed, sanitized payload - `data.issues` of `{ source, message, path }` - identical in development and production, and carry a symbol marker that `recognizeValidationError` reads so an observability hook can tell a client's bad input from a bug. The module has zero options, auto-imports both helpers into server code, and declares a `>=4.5.1 <5.0.0` Nuxt compatibility ceiling.
