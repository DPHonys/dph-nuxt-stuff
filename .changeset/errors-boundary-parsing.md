---
'@dphonys/nuxt-handler-errors': minor
'@dphonys/nuxt-typed-handler': minor
---

Error recognition takes an `Error`. `recognizeKnownError` and the degraded `matchError` overload accept a value already narrowed with `instanceof Error` or Nuxt's `isNuxtError`, instead of `unknown`; a bare `catch` value is narrowed at the call site first. `KnownErrorCarrier<E>` is now `NuxtError<KnownErrorBody<E>>`. The known-error wire marker is parsed with a schema, so `zod` becomes a runtime dependency of the errors module. The umbrella module re-exports the narrowed surface.
