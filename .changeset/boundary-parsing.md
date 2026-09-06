---
'@dphonys/nuxt-handler-errors': minor
'@dphonys/nuxt-handler-validation': minor
'@dphonys/nuxt-typed-handler': minor
---

Error recognition takes an `Error`. `recognizeKnownError`, `recognizeValidationError` and the degraded `matchError` overload accept a value already narrowed with `instanceof Error` or Nuxt's `isNuxtError`, instead of `unknown`; a bare `catch` value is narrowed at the call site first. `KnownErrorCarrier<E>` is now `NuxtError<KnownErrorBody<E>>`. Every wire boundary - the known-error marker, the validation marker, request sources and issue paths - is parsed with a schema, so `zod` becomes a runtime dependency of the errors and validation modules. The umbrella module re-exports the narrowed surfaces.
