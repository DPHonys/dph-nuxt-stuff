---
'@dphonys/nuxt-handler-validation': minor
---

Initial release. Declare a Nitro handler's request schemas once with `defineValidatedEventHandler`, and receive the validated values - typed as each schema's output - in the handler's second parameter. All four sources (`routerParams`, `query`, `headers`, `body`) accept any Standard Schema library, mixed freely, and validate before the handler body runs, fail-fast in a guaranteed order. Reusable schema sets are values made by `defineValidation` and composed by array spread, optionally named so their output nests under that name. Failures answer `400` with one fixed, sanitized payload - `data.issues` of `{ source, message, path }` - identical in development and production, and carry a symbol marker that `recognizeValidationError` reads so an observability hook can tell a client's bad input from a bug.
