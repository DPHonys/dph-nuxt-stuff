---
'@dphonys/nuxt-handler-validation': minor
'@dphonys/nuxt-typed-handler': minor
---

`recognizeValidationError` takes an `Error` instead of `unknown`; narrow a bare `catch` value with `instanceof Error` or Nuxt's `isNuxtError` first. Request sources, issue paths and the validation marker are parsed with a schema, so `zod` becomes a runtime dependency of the validation module. The umbrella module re-exports the narrowed surface.
