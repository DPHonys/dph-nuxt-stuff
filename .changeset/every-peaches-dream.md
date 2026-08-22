---
'@dphonys/nuxt-handler-errors': minor
---

Adds the `/internals/build`, `/internals/server`, `/internals/shared` and `/internals/app` entries consumed by `@dphonys/nuxt-typed-handler`. They are not for application code and carry no new behaviour for apps; they are versioned with the umbrella, which pins this package exactly, and sit outside this package's semver. Incidentally public: `createKnownError` (the unthrown known-error product) on `/internals/server`, and `emitMap` now accepting `slots` and a `generatedBy` banner.
