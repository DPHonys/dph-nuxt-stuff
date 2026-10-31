---
'@dphonys/better-handler': minor
---

First release. A Nitro handler declares its request schemas, response schema and expected failures once, and every call site gets all of them typed. Schemas are any Standard Schema library's. It replaces `@dphonys/nuxt-handler-errors`, `@dphonys/nuxt-handler-validation` and `@dphonys/nuxt-typed-handler`.

- `defineBetterEventHandler(options, handler)` declares any combination of `input`, `output` and `errors`, and refuses a route that declares none. The handler's context holds exactly what the route declared.
- `input` maps `route`, `query`, `headers` and `body` to a schema or a non-empty tuple of schemas. Sources are validated before the handler runs; the first source with issues answers `400` with the built-in `validation-failed` variant, `{ _tag, issues }`.
- `output` is one schema for a plain `200` reply, or a map from a status between `100` and `399` to a schema or `null`, answered through `respond(status, value)`.
- `errors` maps a tag to `{ status, schema? }`, with `status` from `400` to `599`. `defineError(tag, entry)` declares one for reuse by object spread. `fail(tag, fields)` builds a Known error, and any thrown value with a declared `_tag` is one too. It goes out with its declared status and `{ _tag, ...fields }` as the body's `data`. `recognizeKnownError` reads it back in a Nitro error hook.
- A development server checks responses and thrown fields against their schemas, and refuses a thrown `_tag` the route does not declare. `devChecks: false` turns these checks off; production never runs them.
- `$betterFetch` (app, Nitro and `shared/`) and `event.$betterFetch` type `body`, `query` and `headers` from the route's schemas, the response from its `output`, and its failures as a union keyed by `_tag`. `.try` resolves to `{ data, error }` instead of throwing.
- `matchError(error, arms, fallback)` from `@dphonys/better-handler/shared` calls one arm per `_tag`, plus a fallback for a tag no arm names.
- `useBetterFetch`, `useLazyBetterFetch`, `useBetterAsyncData`, `useLazyBetterAsyncData` and `useRequestBetterFetch` are auto-imported in the app.
- `nuxt prepare` and every dev-server rebuild generate the typed route maps that the call sites read.
- Supports Nuxt `>=4.0.0 <5.0.0`. On Nuxt 4.6 and later, with `experimental.routeTypedFetch: true`, Nuxt's own `$fetch` and `useFetch` also type record bodies and queries on these routes.
