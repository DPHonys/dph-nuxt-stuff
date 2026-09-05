---
'@dphonys/nuxt-handler-errors': minor
'@dphonys/nuxt-typed-handler': minor
---

Add handler-local `errors` definition records and throwable typed factories. Standard Schema-backed `data` accepts schema inputs, validates synchronously or asynchronously, and exposes transformed outputs under the client variant's `data` property. Preserve endpoint-specific generated error maps, exhaustive matching, native success responses, and the existing error channel. The umbrella keeps validated context properties and its built-in validation failure.

Deprecate array declarations, `defineError`, `payload`, and string-based `fail` without removing compatibility. When migrating a payload-bearing declaration to the new API, update client access from flat variant fields to `variant.data`. Examples and documentation now prefer local factories.
