---
'@dphonys/nuxt-handler-errors': minor
'@dphonys/nuxt-typed-handler': minor
---

Replace the string-based `fail` helper with handler-local typed error factories: declare `{ errors: [...userErrors] }`, receive `{ errors }` in the handler context, and write `throw errors.conflict(input)`. Keep `defineError` singles and groups, group spread, `.pick()`, and type-only `payload<T>()` as first-class APIs. Inline handler error records are not part of the API.

Standard Schemas in `payload` now validate factory inputs at runtime, synchronously or asynchronously, and expose transformed output as flat client fields such as `e.email`, not `e.data.email`. Type-only `payload<T>()` remains usable without runtime validation. Invalid schema payloads answer an unmarked 500; factory results are thrown synchronously and finalized at the handler boundary.

This pre-1.0 minor release contains breaking call-site changes: `fail` is removed, and payload schemas now execute rather than supplying types alone. There is no compatibility or deprecation layer. Preserve declaration tags and statuses when migrating; client field access, endpoint-specific generated error maps, exhaustive matching, native success responses, and channel gating are unchanged. The umbrella retains validated context properties and its built-in `validation-failed` variant.
