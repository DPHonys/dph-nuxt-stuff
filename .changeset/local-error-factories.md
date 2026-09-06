---
'@dphonys/nuxt-handler-errors': minor
'@dphonys/nuxt-typed-handler': minor
---

Handler-local typed error factories: declare `{ errors: [...userErrors] }`, receive `{ errors }` in the handler context, and write `throw errors.conflict(input)`. `defineError` declares singles and groups; groups spread into the `errors` array and narrow with `.pick()`. Each factory is reachable by dot access, so every tag is a valid identifier such as `userNotFound`, checked at compile time and at declaration.

A definition's optional `payload` is a Standard Schema, validated at runtime when the factory is called, synchronously or asynchronously, before the failure leaves the handler. A factory takes the schema's input and the client receives its output as flat fields such as `e.email`, beside `tag` and `status`. A definition without `payload` yields a zero-argument factory. Invalid schema payloads answer an unmarked 500; factory results are thrown synchronously and finalized at the handler boundary.

The generated per-endpoint error maps, exhaustive matching, native success responses, and channel gating work over these declarations unchanged. The umbrella keeps its validated context properties and its built-in `validationFailed` variant.
