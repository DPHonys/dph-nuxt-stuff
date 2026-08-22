---
'@dphonys/nuxt-handler-validation': minor
---

Adds the `/internals/server` and `/internals/shared` entries consumed by `@dphonys/nuxt-typed-handler`. They are not for application code and carry no new behaviour for apps; they are versioned with the umbrella, which pins this package exactly, and sit outside this package's semver. Incidentally public on `/types`: the request-input family (`InputOf`, `MergedInput`, `SourceInput`, `RequestInput`), `ValidatedEventHandler` (what `defineValidatedEventHandler` now returns - a subtype of the previous `EventHandler`), `RequestInputOfHandler`, and the previously internal `ValidationSchemasGuard` / `ValidationDeclarationError`.
