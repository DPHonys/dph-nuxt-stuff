---
'@dphonys/nuxt-handler-errors': minor
---

Adds the `/internals/build`, `/internals/server`, `/internals/shared` and `/internals/app` entries consumed by `@dphonys/nuxt-typed-handler`. They are not for application code and carry no new behaviour for apps; they are semver-honoured. Incidentally public: `createKnownError` (the unthrown known-error product) on `/internals/server`, and `emitMap` now accepting `slots` and a `generatedBy` banner.
