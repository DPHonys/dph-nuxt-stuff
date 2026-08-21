# h3 v2 / Nitro v3 / Nuxt 5 vocabulary for the umbrella module

Research note, 2026-08-21. Answers the wayfinder ticket: which handler names
the platform owns, how h3 v2 puts a validation failure on the wire, whether
the platform has declared route errors or typed fetch errors, and what Nuxt
calls its fetch variants.

## Sources read

Primary sources only. Source was read from shallow clones at these commits:

| Project | Branch / commit                                                     | Version in `package.json`                        |
| ------- | ------------------------------------------------------------------- | ------------------------------------------------ |
| h3      | `h3js/h3` `main` @ `1892ee9cae06533c7db72a5213bceda61cc1d58d`       | `2.0.1-rc.29`                                    |
| Nitro   | `nitrojs/nitro` `main` @ `e36e7a60a339cb9bcc770089aa3e2657c8d21e96` | `3.0.260610-beta` (depends on `h3 ^2.0.1-rc.29`) |
| Nuxt    | `nuxt/nuxt` `main` @ `bc41aa9c905d009761f6cb7dfe0e1325910f992f`     | `5.0.0-0`                                        |

Web pages fetched: h3 docs (the `docs/` folder of the same clone),
<https://nitro.build/blog/v3-beta>, <https://nitro.build/docs/migration>,
<https://nuxt.com/docs/5.x/getting-started/upgrade> (also present in the
nuxt clone as `docs/1.getting-started/*upgrade*.md`),
<https://github.com/nuxt/nuxt/issues/23009>,
<https://github.com/nuxt/nuxt/issues/15261>.

Anything below marked **not verified** was not confirmed against a primary
source in this pass.

---

## 1. Handler definers h3 v2 ships, and what is off limits

### What h3 exports

`src/index.ts` (h3 `main`) exports these handler-shaped definers:

- `defineHandler`, `defineLazyEventHandler`, `dynamicEventHandler`,
  `defineValidatedHandler`, `toEventHandler` (from `src/handler.ts`)
- `defineMiddleware`, `callMiddleware`, `composeMiddleware`, `toMiddleware`
- `defineRoute`, `removeRoute` (`src/utils/route.ts`) - `defineRoute` wraps
  `defineValidatedHandler`
- `definePlugin`, `defineWebSocketHandler`, `defineWebSocket`,
  `defineJsonRpcHandler`, `defineJsonRpcWebSocketHandler`,
  `defineNodeHandler`, `defineNodeMiddleware`
- via `export * from "./_deprecated.ts"`: `defineEventHandler`,
  `eventHandler`, `lazyEventHandler` (plain aliases of `defineHandler` /
  `defineLazyEventHandler`, _not_ marked `@deprecated` in source),
  `defineNodeListener`, `createError`, `isError`, `H3Error`, `createApp`,
  `createRouter`, `useBase`, and the old `get*/set*/read*/send*` helpers
  (all `@deprecated`).

The migration guide (`docs/5.migration/0.index.md`) says:
"`eventHandler`/`defineEventHandler`: Migrate to `defineHandler` (you can
also directly use a function!)" and "`createError`/`H3Error`: Migrate to
`HTTPError`".

### Option shapes (h3 `src/handler.ts`, `src/types/handler.ts`)

```ts
// defineHandler - function or object form
defineHandler(handler)
defineHandler({ handler?, fetch?, middleware?: Middleware[], meta?: H3RouteMeta })
// -> EventHandlerWithFetch (the handler gains `.fetch(req | URL | string)`)

// defineValidatedHandler - JSDoc: "@experimental ... API may change"
defineValidatedHandler({
  ...EventHandlerObject minus handler,
  validate?: {
    body?: StandardSchemaV1
    headers?: StandardSchemaV1
    query?: StandardSchemaV1
    onError?: (result: FailureResult & { _source?: string }) => ErrorDetails
  },
  handler: EventHandler<{ body: InferOutput<Body>; query: StringHeaders<InferOutput<Query>> }, Res>
})
// -> EventHandlerWithFetch<TypedRequest<Body, Headers>, Res>   (TypedRequest from `fetchdts`)
```

Notes on the shape:

- Only `body`, `headers`, `query` are validated. **There is no
  `routerParams` / `params` key** in `validate` (the ad-hoc
  `getValidatedRouterParams(event, schema)` util still exists).
- This path is Standard Schema only (`"~standard"`); the ad-hoc utils
  (`readValidatedBody`, `getValidatedQuery`, `getValidatedRouterParams`,
  `getValidatedCookies`) also accept a `(data) => T | true | false`
  function.
- `query` output is forced to strings (`StringHeaders<>`), and validated
  query/header values are written back onto `event.url.searchParams` /
  `event.req.headers`, so the handler reads them from the request, not from
  a second argument.
- Body validation is lazy: `event.req` is replaced by a Proxy whose
  `.json()` validates; `.text()/.formData()/.arrayBuffer()/.body` throw a
  `TypeError` when body validation is on.
- `EventHandlerRequest` is `{ body?, query?, routerParams? }`; h3 types
  `routerParams` in the request generic even though `validate` cannot fill
  it.
- `defineRoute({ method, route, handler, middleware?, meta?, validate? })`
  returns an `H3Plugin`; its `validate` is untyped (`// TODO: Support
generics for better typing`).

### How these names reach Nuxt server code (the squatting rule)

Nuxt 5 auto-imports **every lowercase export of `nitro/h3`** into server
code. `packages/nitro-server/src/imports.ts` (nuxt `main`):

```ts
export async function getH3ImportsPreset() {
  const h3Exports = await resolveModuleExportNames('nitro/h3', {
    url: import.meta.url,
  })
  return {
    from: 'nitro/h3',
    imports: h3Exports.filter((n) => !/^[A-Z]/.test(n) && n !== 'use'),
  }
}
```

Nitro's `nitro/h3` entry is `export * from "h3"` (`nitro/lib/h3.mjs`,
`package.json` `"./h3": "./lib/h3.mjs"`). The preset is registered in
`packages/nitro-server/src/index.ts` next to `v2ImportsPreset`. So the
off-limits set is computed, not curated: whatever h3 exports in lowercase is
an auto-import in Nuxt 5 server code, including the `_deprecated.ts`
aliases. The Nuxt 5 upgrade guide confirms the intent: "Auto-imports within
server routes (`defineEventHandler`, `getQuery`, `readBody`,
`useRuntimeConfig`, etc.) continue to work without changes."

Nitro itself (without Nuxt) only auto-imports `server/utils/**` by default
(`nitro/src/config/resolvers/imports.ts`, `docs/4.examples/auto-imports.md`);
its own examples import `defineHandler` from `"nitro"` explicitly. The
h3-names preset is Nuxt's.

### Off-limits names for the umbrella

Do not export any of these as an auto-import (all are, or will be, ambient
in Nuxt 5 `server/`):

**h3 handler/definer vocabulary**

`defineHandler`, `defineValidatedHandler`, `defineEventHandler`,
`eventHandler`, `defineLazyEventHandler`, `lazyEventHandler`,
`dynamicEventHandler`, `toEventHandler`, `defineRoute`, `removeRoute`,
`defineMiddleware`, `callMiddleware`, `composeMiddleware`, `toMiddleware`,
`definePlugin`, `defineWebSocketHandler`, `defineWebSocket`,
`defineJsonRpcHandler`, `defineJsonRpcWebSocketHandler`,
`defineNodeHandler`, `defineNodeMiddleware`, `defineNodeListener`,
`fromWebHandler`, `toWebHandler`, `fromNodeHandler`, `fromNodeMiddleware`,
`toNodeHandler`, `toNodeListener`, `createApp`, `createRouter`, `useBase`,
`withBase`.

**h3 error / validation vocabulary**

`createError`, `isError`, `onError`, `onRequest`, `onResponse`,
`readValidatedBody`, `getValidatedQuery`, `getValidatedRouterParams`,
`getValidatedCookies`, `readBody`, `getQuery`, `getRouterParam(s)`,
`sanitizeStatusCode`, `sanitizeStatusMessage`, `toResponse`. Uppercase
classes `HTTPError`, `H3Error`, `H3Event`, `H3`, `HTTPResponse`,
`EventStream` are _not_ auto-imported (filtered by the `^[A-Z]` rule) but are
still platform names.

**Nitro vocabulary auto-imported by Nuxt** (`v2ImportsPreset`)

`defineRouteMeta`, `defineNitroErrorHandler` (alias of Nitro's
`defineErrorHandler`), `defineNitroPlugin`, `nitroPlugin`,
`defineCachedFunction`, `cachedFunction`, `defineCachedHandler`,
`defineCachedEventHandler`, `cachedEventHandler`, `useStorage`,
`defineTask`, `runTask`, `useNitroApp`, `getRouteRules`,
`useRuntimeConfig`. (`// TODO: defineRenderHandler and useEvent` in that
file - expect those too.)

**Nuxt app-side reserved names** (`packages/nuxt/src/imports/presets.ts`)

`useFetch`, `useLazyFetch`, `createUseFetch`, `useAsyncData`,
`useLazyAsyncData`, `createUseAsyncData`, `useNuxtData`, `refreshNuxtData`,
`clearNuxtData`, `useRequestFetch`, `useRequestEvent`, `useRequestHeader(s)`,
`useResponseHeader`, `setResponseStatus`, `createError`, `showError`,
`clearError`, `isNuxtError`, `useError`. The `useFetch` doc adds: "`useFetch`
is a reserved function name transformed by the compiler, so you should not
name your own function `useFetch`."

**Pattern to avoid**: any `define*Handler` / `*EventHandler` name h3 might
plausibly add next (the project already renamed `defineEventHandler` to
`defineHandler` and shipped `defineValidatedHandler` as `@experimental`, so
the `define<Adjective>Handler` slot is theirs). The repo's existing choices
`defineCheckedEventHandler` and `defineValidatedEventHandler` collide with
nothing above; neither is exported by h3 at this commit.

---

## 2. Validation failure on the wire

Source: h3 `src/utils/internal/validate.ts` (`createValidationError`),
`src/error.ts` (`HTTPError.toJSON`), `src/response.ts` (`errorResponse`).

When a Standard Schema rejects, h3 throws:

```ts
new HTTPError({
  cause, // the FailureResult (never serialized)
  status: 400,
  statusText: 'Validation failed',
  message: 'Validation failed', // or onError()'s message
  data: {
    issues: result.issues, // raw Standard Schema issues, unprojected
    message: 'Validation failed',
  },
})
```

`HTTPError.toJSON()` yields the body and `errorResponse` serializes it with
`content-type: application/json`, status `error.status`, statusText
`error.statusText`, plus `error.headers` and `event.res.errHeaders`:

```jsonc
{
  "status": 400,
  "statusText": "Validation failed",
  "message": "Validation failed",
  "data": {
    "issues": [{ "message": "...", "path": ["..."] }],
    "message": "Validation failed",
  },
  // "unhandled": only present when set
  // "stack": [ "..." ] only when H3 `debug` is on
}
```

Facts that matter for the umbrella:

- Status is **400**, `statusText`/`message` are the literal string
  **`"Validation failed"`** (the docs still say "`400 Validation Error`" in
  `docs/4.examples/validate-data.md`; the source string wins).
- **`data.issues` is the raw `FailureResult.issues` array** - Standard
  Schema `Issue` = `{ message: string; path?: ReadonlyArray<PropertyKey |
PathSegment> }`. Nothing is projected: `path` can hold symbols or
  `{ key }` segments, and vendor extras survive. No `source` field on the
  issues; `_source` (`"body" | "headers" | "query"`) is only passed to the
  user's `onError` callback, never emitted.
- **There is no marker** on the wire beyond `status: 400` + `data.issues`.
  Nothing distinguishes a validation 400 from any other 400.
- Keys are **`status`/`statusText`**, not `statusCode`/`statusMessage`
  (those remain as deprecated getters on the class only).
- `onError` lets the handler author replace the whole `ErrorDetails`
  (status, message, data) per failure; if it returns an `HTTPError` it is
  thrown as-is.
- Unhandled (non-`HTTPError`) errors hide `message`, `data`, `body`, `stack`
  and render `{ status: 500, unhandled: true, message: "HTTPError" }`.

Nitro v3 adds an envelope in its default error handler
(`nitro/src/runtime/internal/error/prod.ts`):
`{ error: true, ...error.toJSON() }`; the dev handler (`error/dev.ts`)
additionally emits `stack` (array of trimmed lines) and `url`. So under
Nuxt 5 a validation failure arrives as
`{ error: true, status: 400, statusText: "Validation failed", message, data: { issues, message } }`
(+ `stack`, `url` in dev).

### Typed error with `data`

Yes. `HTTPError<DataT = unknown>` is generic in `data`
(`readonly data: DataT | undefined`), has `HTTPError.isError(input)`
(name-based, cross-realm), `HTTPError.status(code, text?, details?)`, and
also carries `body` (extra top-level JSON keys), `headers`, `cause`,
`unhandled`. There is **no dedicated `ValidationError` class** - the JSDoc
`@throws {ValidationError}` in `validateData` refers to nothing exported.
Nuxt 5's `NuxtError<DataT>` "is now its own class rather than a subclass of
h3's `HTTPError`" but keeps `name === "HTTPError"` so `HTTPError.isError`
matches both (`packages/nuxt/src/app/composables/error.ts`; upgrade guide
section "`createError` No Longer Returns an `HTTPError` Instance").

---

## 3. Declared route errors / typed fetch errors

**h3 v2: none.** Searched `src/` for declared-error, error-union or
route-error concepts. `EventHandlerWithFetch<Req, Res>` types the _success_
response via `fetchdts` `TypedResponse<Res, ResponseHeaderMap>`; the error
channel is `unknown` (`toError()` normalizes anything thrown). `H3RouteMeta`
is an open bag for user metadata, not an error contract.

**Nitro v3: none.** `nitro/src/types/fetch/fetch.ts` defines
`InternalApi {}` (augmented per route by generated types),
`TypedInternalResponse<Route, Default, Method>`, `AvailableRouterMethod`,
`NitroFetchOptions` (only narrows `method`), and `$Fetch`. Nothing types the
request `body`/`query`, and nothing types errors. The file carries
`// TODO: upgrade to uppercase for h3 v2 types and web consistency` - the
typed-fetch layer is still the v2 design. Nitro's `defineErrorHandler` /
`NitroErrorHandler` is a single global renderer.

**Nuxt 5 main: none.** `useFetch`'s `ErrorT` generic defaults to
`NuxtError<unknown>` and is a caller-supplied annotation, not inferred from
the route (`packages/nuxt/src/app/composables/fetch.ts`). The only related
Nuxt 5 change is `experimental.parseErrorData` being forced on, so
`error.data` on the error page "is always the value you passed to
`createError`" (upgrade guide).

Conclusion: declared, typed route failures remain a gap the repo's
`nuxt-handler-errors` fills; there is no platform name or wire shape to
align with beyond "a 4xx/5xx `HTTPError` JSON body with free-form `data`".

---

## 4. Nuxt naming for fetch variants, and Nuxt 5 `useFetch` typing

### Naming conventions in core

Nuxt names fetch variants by **prefix composition, one axis per infix**, and
the sanctioned way to make a variant is a factory:

- `useFetch` / `useLazyFetch` - laziness is a `Lazy` infix.
- `useAsyncData` / `useLazyAsyncData` - same infix.
- `useRequestFetch` - SSR-context-forwarding `$fetch`.
- `createUseFetch` / `createUseAsyncData` - **the factory pattern for custom
  variants** (`defineKeyedFunctionFactory`, exported and auto-imported; docs
  `4.api/2.composables/create-use-fetch.md`, `create-use-async-data.md`).
  Docs recommend it over wrapping: "Use `createUseFetch` to create a fully
  typed custom composable."
- No `useTypedFetch`, `useSafeFetch`, `useCheckedFetch` or similar exists in
  core at this commit (grep of `packages/nuxt/src` and `docs/`).
- Server-side: `event.$fetch` (Nitro) and `useRequestFetch()`.

So the repo's `useCheckedFetch` / `useLazyCheckedFetch` /
`useRequestCheckedFetch` / `useCheckedAsyncData` / `useLazyCheckedAsyncData`
follow the core pattern (adjective infix, `Lazy` kept in the same slot).
Because `useFetch` and `useAsyncData` are compiler-transformed keyed
functions, a custom variant should go through `createUseFetch` /
`createUseAsyncData` (or accept a user-supplied key) to keep auto-keying;
that is how core expects variants to be built.

### Nuxt 5 plans for request-side typing

- Request `body`/`query` typing for `$fetch`/`useFetch` is tracked in
  nuxt/nuxt **#15261** ("Types in body/params when fetching server side
  routes") - **open**, label `p2-nice-to-have`, no milestone; **#23009**
  ("Typed query and body for `$fetch` and `useFetch`") was closed as a
  duplicate of #15261 (labels `types`, `enhancement`, `p2-nice-to-have`,
  milestone "Later", assignee danielroe). No linked PR.
- The Nuxt 5 upgrade guide (fetched 2026-08-21) has **no section on
  `$fetch`/`useFetch` typing**; its typing headline is "Typed Pages Enabled
  by Default".
- The building blocks exist on the h3 side: `defineValidatedHandler` returns
  `EventHandlerWithFetch<TypedRequest<Body, Headers>, Res>` using `fetchdts`
  (h3 v2 beta blog, `docs/99.blog/2.v2-beta.md`: "We have launched a new
  initiative to strongly type Web APIs: fetchdts. Integrated into the H3").
  Nitro's `InternalApi` types are generated from handler _return_ types
  only at this commit, so those request types do not yet flow to `$fetch`.
  Whether Nuxt 5.0 will wire them through: **not verified** (no RFC or PR
  found in the sources read; no web search beyond the two issues was done).

---

## Implications for the umbrella (short)

1. Keep `define<Adjective>EventHandler` naming; never export a lowercase
   name h3 exports, and treat the list in section 1 as generated, not fixed
   (re-run `resolveModuleExportNames('nitro/h3')` when h3 bumps).
2. The repo's validation wire shape (`400`, `statusMessage: "Validation
Error"`, `data.issues[{ source, message, path }]`) is _stricter_ than
   h3's (`"Validation failed"`, raw issues, no `source`). Free alignment
   moves: emit `status`/`statusText` alongside the legacy keys, and keep
   `data.issues` as the array key (same as h3). h3 does not emit `source`,
   so keeping it is an addition, not a conflict.
3. Use `HTTPError` semantics (`status`, `statusText`, `data`, `body`,
   `headers`) as the error vocabulary; there is no platform notion of
   declared errors to align with.
4. Build client variants with `createUseFetch` / `createUseAsyncData` where
   possible; keep the `use<Lazy><Adjective>Fetch` shape.
