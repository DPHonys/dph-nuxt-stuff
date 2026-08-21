# Research: typing `body` / `query` per route in `$betterFetch`

Wayfinder research ticket. Question (verbatim): the umbrella wants
`$betterFetch('/api/users', { method: 'post', body })` to type `body` and
`query` from the route's schema input types, with declared sources **required**
and **excess keys rejected**, without breaking `$fetch`'s existing
overload/`MatchedRoutes` inference or triggering the `TS2321 Excessive stack
depth` failure `packages/nuxt-handler-errors/src/runtime/types/fetch.ts` already
documents.

Date: 2026-08-21. Branch: `research/nitro-request-typing`.

## Sources examined

Installed (pnpm store of the main checkout, `node_modules/.pnpm/…`):

| Package            | Version     | File(s) read                                                        |
| ------------------ | ----------- | ------------------------------------------------------------------- |
| nitropack          | 2.13.4      | `dist/types/index.d.ts` (fetch types), `dist/core/index.mjs` (typegen) |
| ofetch             | 1.5.1       | `dist/shared/ofetch.BbrTaNPp.d.ts`                                   |
| h3                 | 1.15.11     | `dist/index.d.ts`                                                    |
| nuxt               | 4.5.2       | `dist/app/composables/fetch.d.ts`                                    |
| ufo                | 1.6.3       | `dist/index.d.ts` (`QueryObject`)                                     |
| typescript         | 5.9.3       | used for the experiment in "Experiment" below                        |

Upstream `main` (fetched raw, 2026-08-21):

- h3 v2: `src/handler.ts`, `src/types/handler.ts` — <https://github.com/h3js/h3>
- Nitro v3: `src/types/fetch/fetch.ts`, `src/build/types.ts` — <https://github.com/nitrojs/nitro>
- fetchdts: `src/index.ts` — <https://github.com/danielroe/fetchdts>
- nitrojs/nitro issue #938 — <https://github.com/nitrojs/nitro/issues/938>
- nuxt/nuxt issue #23009 — <https://github.com/nuxt/nuxt/issues/23009>

In this repo:

- `packages/nuxt-handler-errors/src/emit-map.ts`
- `packages/nuxt-handler-errors/src/runtime/types/{fetch,handler,index}.ts`
- `packages/nuxt-handler-validation/src/runtime/types/index.ts`,
  `src/runtime/server/index.ts`

**Not verified** (web access was withdrawn before they could be read; nothing
below relies on them): nuxt/nuxt #15261 (the issue #23009 was closed as a
duplicate of), nitrojs/nitro discussion #2157 ("Move types for $Fetch from
nitro to ofetch"), and the `jamiecurnow/nuxt-api-sdk` module. A search for a
module named `nuxt-safe-routes` returned nothing by that name.

---

## 1. How `body` / `query` are typed today, and where an override can hook in

### 1.1 ofetch — the base vocabulary

`ofetch@1.5.1` `dist/shared/ofetch.BbrTaNPp.d.ts`:

```ts
// L9
interface FetchOptions<R extends ResponseType = ResponseType, T = any> extends Omit<RequestInit, "body">, FetchHooks<T, R> {
    baseURL?: string;
    body?: RequestInit["body"] | Record<string, any>;   // L11
    ignoreResponseError?: boolean;
    /** @deprecated use query instead. */
    params?: Record<string, any>;                       // L16
    query?: Record<string, any>;                        // L17
    ...
```

So at the ofetch level both sources are untyped bags. `params` is a deprecated
alias of `query` and must be covered by any "excess keys rejected" story or it
becomes a back door (a caller can put the same pairs in `params`).

### 1.2 Nitro 2.13.4 — only `method` is narrowed

`nitropack/dist/types/index.d.ts`:

```ts
// L120
interface InternalApi {}
// L122
type NitroFetchRequest = Exclude<keyof InternalApi, `/_${string}` | `/api/_${string}`> | Exclude<FetchRequest, string> | (string & {});
// L123
type MiddlewareOf<Route extends string, Method extends RouterMethod | "default"> = Method extends keyof InternalApi[MatchedRoutes<Route>] ? InternalApi[MatchedRoutes<Route>][Method] : never;
// L124
type TypedInternalResponse<Route, Default = unknown, Method extends RouterMethod = RouterMethod> = Default extends string | boolean | number | null | void | object ? Default : Route extends string ? MiddlewareOf<Route, Method> extends never ? MiddlewareOf<Route, "default"> extends never ? Default : MiddlewareOf<Route, "default"> : MiddlewareOf<Route, Method> : Default;
// L125
type AvailableRouterMethod<R extends NitroFetchRequest> = R extends string ? keyof InternalApi[MatchedRoutes<R>] extends undefined ? RouterMethod : Extract<keyof InternalApi[MatchedRoutes<R>], "default"> extends undefined ? Extract<RouterMethod, keyof InternalApi[MatchedRoutes<R>]> : RouterMethod : RouterMethod;
// L126-128
interface NitroFetchOptions<R extends NitroFetchRequest, M extends AvailableRouterMethod<R> = AvailableRouterMethod<R>> extends FetchOptions {
    method?: Uppercase<M> | M;
}
// L129
type ExtractedRouteMethod<R extends NitroFetchRequest, O extends NitroFetchOptions<R>> = O extends undefined ? "get" : Lowercase<Exclude<O["method"], undefined>> extends RouterMethod ? Lowercase<Exclude<O["method"], undefined>> : "get";
// L130
type Base$Fetch<DefaultT = unknown, DefaultR extends NitroFetchRequest = NitroFetchRequest> = <T = DefaultT, R extends NitroFetchRequest = DefaultR, O extends NitroFetchOptions<R> = NitroFetchOptions<R>>(request: R, opts?: O) => Promise<TypedInternalResponse<R, T, NitroFetchOptions<R> extends O ? "get" : ExtractedRouteMethod<R, O>>>;
// L131-134
interface $Fetch<…> extends Base$Fetch<…> {
    raw<T, R, O extends NitroFetchOptions<R> = NitroFetchOptions<R>>(request: R, opts?: O): Promise<FetchResponse<TypedInternalResponse<…same…>>>;
    create<T = DefaultT, R extends NitroFetchRequest = DefaultR>(defaults: FetchOptions): $Fetch<T, R>;
}
```

Observations that matter for the design:

- `InternalApi` values are keyed `route -> method -> response type` only. There
  is no request slot anywhere; `body`/`query` fall straight through to ofetch's
  `Record<string, any>`.
- `NitroFetchOptions` already has a second type parameter `M` that narrows
  `method` to the methods the route actually has, accepting both cases
  (`Uppercase<M> | M`). Nitro's own `$fetch` never supplies `M` — it infers the
  whole options object as `O` and extracts the method afterwards with
  `ExtractedRouteMethod`, lower-casing on the way.
- The `NitroFetchOptions<R> extends O ? "get" : …` guard in `Base$Fetch` exists
  because when `opts` is omitted `O` falls to its default and `O["method"]` is
  the full method union; without the guard the response would be the union of
  every method's response.
- `MatchedRoutes<R>` (L162-163) is a scoring template-literal matcher over
  `keyof InternalApi`; it is what makes `/api/items/42` resolve to
  `'/api/items/:id'`. Anything new must evaluate it at most once more per call,
  not per candidate key.

### 1.3 Nitro's route-type generator

`nitropack/dist/core/index.mjs`:

```js
// L1186-1190
const method = mw.method || "default";
types.routes[mw.route] ??= {};
types.routes[mw.route][method] ??= [];
types.routes[mw.route][method].push(
  `Simplify<Serialize<Awaited<ReturnType<typeof import('${relativePath}').default>>>>`
// L1249-1263 renders
//   declare module "nitropack/types" { interface InternalApi { '<route>': { '<method>': A | B } } }
```

Method keys are whatever the scanner put in `mw.method` (Nitro's file-suffix
scanner yields lowercase; a user-registered handler could carry any case — the
repo's `emit-map.ts` L74 lowercases for this reason). Nothing about the
handler's input is extracted; only `ReturnType`.

### 1.4 Nitro v3 `main` — unchanged on this axis

`src/types/fetch/fetch.ts` on `main` is the same design: `InternalApi {}` (L6),
`NitroFetchOptions … extends FetchOptions { method?: Uppercase<M> | M }`
(L51-56), `ExtractedRouteMethod` (L59-66), `Base$Fetch` with the same
`NitroFetchOptions<R> extends O ? "get"` guard (L68-80). The only new thing is a
comment at L8: `// TODO: upgrade to uppercase for h3 v2 types and web
consistency` — so `RouterMethod` may flip to uppercase in v3, which argues for
normalising with `Lowercase<M>` at every lookup rather than trusting the
generated key's case.

`src/build/types.ts` L37-42 still emits `mw.method || "default"` and
`Simplify<Serialize<Awaited<ReturnType<typeof import(...).default>>>>`. No
request slot has been added upstream.

### 1.5 Nuxt 4.5.2 `useFetch` — a second, different `NitroFetchOptions`

`nuxt/dist/app/composables/fetch.d.ts`:

```ts
// L7
type AvailableRouterMethod$1<R extends NitroFetchRequest> = AvailableRouterMethod<R> | Uppercase<AvailableRouterMethod<R>>;
// L10-13  (Nuxt's OWN interface, shadowing Nitro's name)
interface NitroFetchOptions<R extends NitroFetchRequest, M extends AvailableRouterMethod$1<R> = AvailableRouterMethod$1<R>, DataT = any> extends Omit<FetchOptions<ResponseType, DataT>, 'cache'> {
  method?: M;
  cache?: FetchOptions<ResponseType, DataT>['cache'] | false;
}
// L27 (one of five overloads)
<ResT = void, ErrorT = NuxtError<unknown>, ReqT extends NitroFetchRequest = NitroFetchRequest,
 const Method extends AvailableRouterMethod$1<ReqT> = ResT extends void ? 'get' extends AvailableRouterMethod$1<ReqT> ? 'get' : AvailableRouterMethod$1<ReqT> : AvailableRouterMethod$1<ReqT>,
 _ResT = ResT extends void ? FetchResult<ReqT, Method> : ResT, …>
(request: Ref<ReqT> | ReqT | (() => ReqT), opts: UseFetchOptionsWithTransform<_ResT, DataT, PickKeys, DefaultT, ReqT, Method>): AsyncData<…>
// L8
type FetchResult<ReqT, M> = TypedInternalResponse<ReqT, unknown, Lowercase<M>>;
```

This is the important precedent: Nuxt does **not** infer an `O` for the whole
options bag. It infers a `const Method` type parameter from `opts.method`
(either case), defaults it to `'get'` when the route has a `get`, and passes
`Method` into a concrete options type. The options parameter is therefore a
non-generic object type at the call site — exactly the situation in which
TypeScript performs excess-property checking on a fresh literal.

### 1.6 Where a per-route override can hook in

Three candidate hook points, evaluated in section 2:

| Hook                                                | Mechanism                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| (a) Constraint on `O`                               | `O extends NitroFetchOptions<R> & RequiredSources<InputsOf<R, MethodOf<O>>>` (keep Nitro's `<T, R, O>` shape) |
| (b) Strict mapped constraint on `O`                 | `O extends StrictOpts<R, O>` where `StrictOpts` is homomorphic over `keyof O` and maps undeclared keys to `never` |
| (c) Separate `M`, concrete `opts` type (Nuxt style) | `<T, R, const M extends MethodArg<R>>(request: R, opts?: RequestOptions<R, M>)`            |

A fourth option — a *separate overload* on top of `Base$Fetch` — reduces to one
of the above for the typed overload, and adds overload-resolution ambiguity
(TypeScript tries overloads in order and reports the last failure, so the
helpful "property `extra` does not exist" message is lost when the second,
untyped overload also fails). It is not recommended.

### 1.7 The local map mechanism request typing would extend

`packages/nuxt-handler-errors/src/emit-map.ts`:

- L56-86 `emitMap` re-runs Nitro's route loop; L71 skips function handlers and
  middleware; L74 lowercases `mw.method || 'default'`; L127 emits
  `Simplify<Serialize<KnownErrorsOfHandler<typeof import('<spec>').default>>>`
  per handler, joined with `|` for several handlers on one route+method (L118).
- L94-109 wraps it in `declare module '@dphonys/nuxt-handler-errors/types' { interface KnownApiErrors { … } }`.

`src/runtime/types/handler.ts` L30-36: the channel is a phantom property on the
handler type (`__knownErrors__?: Errors` on `CheckedEventHandler`); L42-47
`KnownErrorsOfHandler<T>` reads it back with `IsAny` and
`Exclude<E, undefined>` guards.

`src/runtime/types/index.ts` L42-56 `KnownErrorsOfRoute<R, M>`: `MatchedRoutes<R>`
once, distribute over matched keys, `Lowercase<M>` lookup, `'default'`
fallback by presence (not by `never`).

`src/runtime/types/fetch.ts` L46-58: the `TS2321` lesson — the method is a
defaulted parameter of an **alias** (`TryResultFor`), never of the call
signature, because a constrained signature parameter is checked eagerly with
`R`/`O` unresolved. L21-23: `R extends string ? … : never` because
`NitroFetchRequest` admits a `Request` object.

`packages/nuxt-handler-validation/src/runtime/server/index.ts` L30-37:
`defineValidatedEventHandler<const S, Response, Request>` returns a plain
`EventHandler<Request, Response>` — **`S` is dropped at the return type**. The
generated map reads `typeof import(...).default`, so for request typing the
returned handler type must carry the schemas (a phantom slot like
`__knownErrors__`), the same way `CheckedEventHandler` does. `ValidatedContext<S>`
(`types/index.ts` L77-81) already computes "which sources are guaranteed" as
"slot type cannot be `undefined`" and types them as schema **output**.

---

## 2. Are "required when declared" and "excess keys rejected" achievable?

### 2.1 The TypeScript facts

- Excess-property checking runs when a **fresh object literal** is assigned to
  a target whose type is known and non-generic at that point (TS handbook,
  "Excess Property Checks",
  <https://www.typescriptlang.org/docs/handbook/2/objects.html#excess-property-checks>).
  When the parameter type is a bare type parameter `O`, the literal's type *is*
  `O`; the constraint is then checked by assignability, which is structural and
  permits extra keys. This was confirmed empirically below (case A3).
- A constraint may mention the parameter itself (`O extends Strict<O>`), but
  not through a conditional whose check type is `O` — that is
  `TS2313: Type parameter 'O' has a circular constraint` (observed on the first
  draft of variant B). A homomorphic mapped type over `keyof O` is allowed.
- A type parameter whose default does not satisfy its constraint silently
  resolves to the constraint. With Nitro's shape the default *is* the
  constraint (`O extends NitroFetchOptions<R> = NitroFetchOptions<R>`); the
  moment the constraint is extended with a required `body`, the default stops
  satisfying it, the `NitroFetchOptions<R> extends O` guard fails, and a no-opts
  call collapses to the union of every method's response (cases A5/B5).

### 2.2 Experiment (TypeScript 5.9.3 against the real nitropack 2.13.4 types)

A scratch `tsconfig` mapped `nitropack/types`, `h3` and `ofetch` to the
installed `.d.ts` files, stubbed `InternalApi` with
`'/api/users': { post; get }` and `'/api/items/:id': { default }`, and a
hand-written `KnownApiInputs` with `'/api/users'.post.body = { name: string; age?: number }`
and `'/api/items/:id'.default.query = { expand?: boolean }`. Three signatures
were declared (abbreviated; the full text is in §4):

```ts
// A — intersected constraint on O
<T, R extends NitroFetchRequest, O extends NitroFetchOptions<R> & RequiredSources<InputsOf<R, MethodOf<O>>> = NitroFetchOptions<R>>(request: R, opts?: O)
// B — homomorphic strict constraint on O
<T, R extends NitroFetchRequest, O extends StrictOpts<R, O> = NitroFetchOptions<R>>(request: R, opts?: O)
// C — Nuxt style
<T, R extends NitroFetchRequest, const M extends MethodArg<R> = 'get' extends MethodArg<R> ? 'get' : MethodArg<R>>(request: R, opts?: RequestOptions<R, M>)
```

Results (✓ = behaves as wanted, ✗ = does not):

| Case                                                         | A   | B   | C   |
| ------------------------------------------------------------ | --- | --- | --- |
| `post` with correct literal body; response `{ id }` inferred | ✓   | ✓   | ✓   |
| `post` without body → error "body missing"                   | ✓   | ✓   | ✓   |
| `post` body with excess key `extra` → error                  | ✗ (accepted) | ✓ (`number` not assignable to `never`) | ✓ (`TS2353 Object literal may only specify known properties`) |
| `method: 'POST'` (uppercase) accepted, response inferred     | ✓   | ✓   | ✓   |
| No opts: `GET` response `{ users }` inferred                 | ✗ (union of both methods) | ✗ (same) | ✓ |
| `new Request(...)` as `R`, `method: 'post'`                  | ✓   | ✓   | ✓   |
| Body from a variable typed `{ name: string }`                | ✓   | ✓   | ✓   |
| Body from a *wider* variable `{ name, extra }`               | ✓ accepted | ✗ rejected | ✓ accepted (TS semantics) |
| `/api/items/42` no opts → `'default'` handler, query optional| ✓   | ✓   | ✓   |
| Excess key in `query` on the `default` route                 | ✗   | ✓   | ✓   |
| External URL with arbitrary body                             | ✓   | ✓   | ✓   |
| Wrong body value type (`name: 1`)                            | ✓ (`number`→`string`) | ✓ (message says `never`) | ✓ (`number`→`string`) |
| Extra ofetch option (`headers`) alongside body               | ✓   | ✓   | ✓   |
| Explicit `T` override `fetchC<{ custom: true }>`             | –   | –   | ✓   |
| Template-literal route `` `/api/items/${id}` `` with query   | –   | –   | ✓   |
| `method` in a variable typed `'post' \| 'get'` with body      | –   | –   | ✓   |
| Same, without body → error (required for the `post` branch)  | –   | –   | ✓   |
| `TS2321 Excessive stack depth` anywhere                      | none | none | none |

Conclusions:

1. **"Required when declared" is achievable with every hook**, including a plain
   `O extends …` constraint.
2. **"Excess keys rejected" is not achievable with a plain constraint** (A). It
   needs either the `never`-mapping trick (B), which over-rejects wider
   variables and degrades messages, or a **concrete options type** (C), which
   gets TypeScript's native excess check for free with the best diagnostics.
3. The `O`-inferring family (A, B) **breaks no-opts calls** unless the default
   for `O` is re-derived per route to satisfy the extended constraint — more
   machinery on the hot path of every call. C avoids the problem by
   construction because nothing is inferred from the bag as a whole.
4. `Request` objects as `R`: `R extends string ? … : never` (already the
   pattern in `fetch.ts` L21) degrades to "no declared inputs" and ofetch's
   loose `body`/`query` return. Confirmed harmless in all variants.
5. Method case: read the method through `Lowercase<M>` at every lookup
   (`InputsOfRoute`, `TypedInternalResponse`), never index the map with the raw
   `M`. `MethodArg<R> = AvailableRouterMethod<R> | Uppercase<…>` is exactly
   Nuxt's `AvailableRouterMethod$1` (fetch.d.ts L7).
6. `params` (ofetch's deprecated alias of `query`) must be `Omit`ted or typed
   identically to `query`, or the excess check is bypassed.

### 2.3 Stack-depth note

No variant produced `TS2321` in the experiment, but the `fetch.ts` L46-49
lesson still applies: in C, the default of `M` references only `R`
(`'get' extends MethodArg<R> ? 'get' : MethodArg<R>`), which is the same default
shape Nuxt 4.5.2 ships (L27) and has been exercised at scale. Do not make `M`'s
default depend on the options object or on a type that re-enters
`NitroFetchOptions<R, O>`.

---

## 3. Upstream precedent for carrying request types through a route map

### 3.1 h3 v2 `defineValidatedHandler` (experimental)

`h3/src/handler.ts` L58-85 on `main`:

```ts
export function defineValidatedHandler<
  RequestBody extends StandardSchemaV1,
  RequestHeaders extends StandardSchemaV1,
  RequestQuery extends StandardSchemaV1,
  Res extends EventHandlerResponse = EventHandlerResponse,
>(def: Omit<EventHandlerObject, "handler"> & {
    validate?: { body?: RequestBody; headers?: RequestHeaders; query?: RequestQuery; onError?: OnValidateError };
    handler: EventHandler<{ body: InferOutput<RequestBody>; query: StringHeaders<InferOutput<RequestQuery>> }, Res>;
  },
): EventHandlerWithFetch<TypedRequest<InferOutput<RequestBody>, InferOutput<RequestHeaders>>, Res>
```

and `h3/src/types/handler.ts`:

```ts
// L12-18
export interface EventHandler<_RequestT extends EventHandlerRequest = EventHandlerRequest, _ResponseT …> {
  (event: H3Event<_RequestT>): _ResponseT;
  meta?: H3RouteMeta;
}
// L30-34
export interface EventHandlerRequest { body?: unknown; query?: Partial<Record<string, string>>; routerParams?: Record<string, string>; }
// L52-57
export type EventHandlerWithFetch<_RequestT, _ResponseT> = EventHandler<_RequestT, _ResponseT> & {
  fetch: EventHandlerFetch<TypedResponse<_ResponseT, ResponseHeaderMap>>;
};
```

What this establishes:

- The validated request type is carried **on the handler's `_RequestT` type
  parameter** (the `EventHandler<{ body; query }, Res>` the caller must write)
  and re-exposed through the handler's own `.fetch` as a fetchdts
  `TypedRequest<Body, Headers>`. `query` is *not* in `TypedRequest` (only body
  and headers), and `InferOutput` is used, i.e. post-transform **output** types
  leak to the fetch side.
- It is keyed by handler, **not by route or method**: there is no route map in
  h3, and `meta?: H3RouteMeta` is untyped metadata. Nitro v3 `main` does not
  (yet) read `_RequestT` into `InternalApi` (§1.4). So there is no upstream
  "route → method → request" map to align with today; the repo's generated map
  is still the only place that information can live.
- h3 v2 constrains `query` to `Partial<Record<string, string>>` and wraps the
  schema output in `StringHeaders<…>`. h3 v1 (installed) is looser:
  `EventHandlerRequest.query?: QueryObject` (h3 `index.d.ts` L285) with ufo's
  `QueryObject = Record<string, QueryValue | QueryValue[]>` and
  `QueryValue = string | number | undefined | null | boolean | Array | Record`
  (ufo `index.d.ts` L1-2). A schema whose query output has non-string values
  satisfies h3 v1's `Request` generic but would not satisfy v2's — a reason not
  to smuggle the request types through `EventHandler<Request>` itself, and to
  use an own phantom slot (memory: "prefer h3 v2 vocabulary when free" — here it
  is not free).
- fetchdts (`src/index.ts`) exports `TypedRequest`, `TypedResponse`,
  `TypedFetchInput`, `TypedFetchRequestInit`, `Endpoints`, `RouteTree` — a
  path-tree vocabulary for typed fetch that h3 v2 uses for `.fetch`. Whether
  Nitro v3 will adopt `RouteTree`/`Endpoints` for `InternalApi` is not
  established by any source read here.

### 3.2 Nitro issue #938 (Feb 2023, closed "not planned")

The only upstream proposal that keys request types on route **and** method:
server routes export `interface QuerySchema` / `interface BodySchema`; the
generator emits `InternalApiQuerySchema` / `InternalApiBodySchema`; and
`NitroFetchOptions` becomes

```ts
type RequestSchema<Base, R extends NitroFetchRequest, M extends AvailableRouterMethod<R> = AvailableRouterMethod<R>> =
  R extends keyof Base ? M extends keyof Base[R] ? Base[R][M] : never : never;
interface NitroFetchOptions<R, M …> extends Omit<FetchOptions, "query" | "body"> {
  method?: Uppercase<M> | M;
  query?: RequestSchema<InternalApiQuerySchema, R, M>;
  body?: RequestSchema<InternalApiBodySchema, R, M>;
}
```

Notable: it keys by lowercase method through `AvailableRouterMethod<R>`, keeps
`body`/`query` **optional**, indexes `Base` by the raw `R` (no
`MatchedRoutes`, so `/api/items/42` would miss), and relies on the `M` type
parameter of `NitroFetchOptions` being supplied — which Nitro's `$fetch` never
does. It was closed without implementation.

### 3.3 Nuxt issue #23009 → #15261

#23009 ("Typed query and body for `$fetch` and `useFetch`") is closed as a
duplicate of #15261 and labelled `p2-nice-to-have`, assigned to danielroe.
**#15261 itself was not read** (see "Not verified").

### 3.4 Community modules

- `nuxt-open-fetch`: the README states it generates clients with
  `openapi-typescript`; that generator's `paths` type is keyed
  `path -> lowercase method -> { parameters: { query; path }, requestBody }`,
  and `openapi-fetch` consumes it with `Omit<RequestInit, 'body'> & { params; body }`
  (from the generator's well-known output shape; the README itself does not
  spell this out — **not verified against its source in this session**).
- `nuxt-api-sdk`: introspects `server/api` into a chainable SDK — **mechanism
  not verified**.
- `nuxt-safe-routes`: no module by that name was found.

### 3.5 Local precedent

`nuxt-handler-validation`'s `defineValidatedEventHandler` is the schema owner,
but today it returns `EventHandler<Request, Response>` and discards `S`. The
request map can only be generated once the returned type carries `S` (or the
derived `{ body; query }` shape) in a phantom slot, mirroring
`CheckedEventHandler.__knownErrors__` (`handler.ts` L30-36).

---

## 4. Recommended type-level shape (for the decision ticket)

### 4.1 Generated map — same emitter, second interface

Emit, beside `KnownApiErrors`, a `KnownApiInputs` interface with identical
keys (route → lowercased method, `'default'` for method-less files) whose
values are `InputsOfHandler<typeof import('<spec>').default>` joined with `|`
for several handlers. `InputsOfHandler` reads a phantom slot on the handler
type (`__requestInputs__?: { body?: …; query?: … }` or the raw `S`), with the
`IsAny`/`Exclude<…, undefined>` guards of `KnownErrorsOfHandler`
(`handler.ts` L42-47). A handler without the slot yields `never` and the route
degrades to ofetch's loose typing.

Two decisions the ticket must make about the emitted value:

- **Input vs output types.** The client sends the pre-transform wire value, so
  the map should carry `StandardSchemaV1.InferInput`, not the `InferOutput`
  that `ValidatedContext` (validation `types/index.ts` L24-27, L77-81) hands
  the handler. h3 v2 leaks `InferOutput` to `.fetch`; this repo should not
  copy that. (`@standard-schema/spec` 1.1.0 exposes both.)
- **Serialisation.** `body` crosses as JSON; `query` crosses as strings.
  Whether to apply Nitro's `Serialize` to `body` (so a `Date` in a schema input
  reads as `string` at the call site) is a product choice; `query` should not be
  `Serialize`d (ufo stringifies numbers/booleans itself).

### 4.2 `$betterFetch` signature — variant C

```ts
type MethodArg<R extends NitroFetchRequest> =
  AvailableRouterMethod<R> | Uppercase<AvailableRouterMethod<R>>   // Nuxt fetch.d.ts L7

type InputsOfRoute<R extends string, M extends RouterMethod> =     // mirrors KnownErrorsOfRoute, index.ts L42-56
  MatchedRoutes<R> extends infer Key
    ? Key extends keyof KnownApiInputs
      ? M extends keyof KnownApiInputs[Key] ? KnownApiInputs[Key][M]
        : 'default' extends keyof KnownApiInputs[Key] ? KnownApiInputs[Key]['default'] : never
      : never
    : never

type InputsFor<R, M extends string> =
  R extends string ? InputsOfRoute<R, Extract<Lowercase<M>, RouterMethod>> : never

type RequiredSources<I> = [I] extends [never] ? {} : { [K in keyof I & ('body' | 'query')]-?: I[K] }

type RequestOptions<R extends NitroFetchRequest, M extends MethodArg<R>> =
  & Omit<NitroFetchOptions<R, Extract<Lowercase<M>, AvailableRouterMethod<R>>>, 'method' | 'body' | 'query' | 'params'>
  & { method?: M }
  & ([InputsFor<R, M>] extends [never]
      ? Pick<NitroFetchOptions<R>, 'body' | 'query' | 'params'>
      : RequiredSources<InputsFor<R, M>> & Omit<Pick<NitroFetchOptions<R>, 'body' | 'query'>, keyof InputsFor<R, M>>)

interface BetterFetch<DefaultT = unknown, DefaultR extends NitroFetchRequest = NitroFetchRequest> {
  <
    T = DefaultT,
    R extends NitroFetchRequest = DefaultR,
    const M extends MethodArg<R> = 'get' extends MethodArg<R> ? 'get' : MethodArg<R>,
  >(request: R, opts?: RequestOptions<R, M>):
    Promise<TypedInternalResponse<R, T, Extract<Lowercase<M>, RouterMethod>>>
}
```

(`params` is dropped from the typed branch on purpose — see §2.2 item 6; the
experiment did not include `params`, so the decision ticket should re-run the
matrix with it.) `.try`, `.raw` and the `create` mirror take the same `<T, R, M>`
shape; `KnownErrorFor<R, M>` already accepts `RouterMethod | Uppercase<…>`
through `Lowercase<M>` (`index.ts` L44, L50).

### 4.3 Trade-offs, stated

| Aspect                                   | C (recommended)                                                   | A (plain `O` constraint)                       | B (strict `O` constraint)                         |
| ---------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------- |
| Required when declared                   | yes                                                               | yes                                            | yes                                               |
| Excess keys rejected (literal)           | yes, native `TS2353`                                              | no                                             | yes, as `X not assignable to never`               |
| Wider non-literal variable               | accepted (standard TS)                                            | accepted                                       | rejected (surprising)                             |
| No-opts call keeps `get` inference       | yes                                                               | breaks unless default `O` is re-derived        | same                                              |
| Signature parity with `Base$Fetch<T,R,O>`| **no** — third type arg is `M`, not `O`; explicit `$fetch<T,R,O>` call sites do not port 1:1 | yes | yes                                    |
| Overload/`MatchedRoutes` inference        | untouched (`R` still inferred the same way)                       | untouched                                      | untouched                                         |
| Extra type-level cost per call           | one more `MatchedRoutes<R>` evaluation                            | same                                           | same + a mapped type over every options key       |
| Upstream alignment                       | matches Nuxt `useFetch`'s `const Method` pattern                  | matches Nitro `$fetch`'s `O`                   | none                                              |
| Risk of `TS2321`                         | low — defaults reference only `R`, as Nuxt's                      | medium — constraint references `O` recursively | medium/high — `O` appears in its own constraint   |

### 4.4 Risks and open points for the decision ticket

1. **Signature divergence**: `$betterFetch<T, R, M>` is not `$fetch<T, R, O>`.
   Acceptable for a new global; document it, and make sure `.try` on
   `$checkedFetch` (`fetch.ts` L61-73) either stays on `O` or migrates
   consistently.
2. **All-optional schemas**: with `-?` applied to declared sources, a route
   whose query schema has only optional keys still *requires* `query: {}`.
   The validation package's "guaranteed when not `undefined`" rule
   (`types/index.ts` L77-81) suggests instead: required only when the input
   type has at least one required key. Needs a decision.
3. **Union methods** (`method: m` with `m: 'post' | 'get'`): inputs distribute,
   so body becomes required for the whole call. Correct but surprising; worth a
   doc line.
4. **`'default'` handlers**: a method-less file answers every verb, so its
   inputs apply to every verb (same fallback rule as `KnownErrorsOfRoute`).
5. **Several handlers on one route+method** produce a union of input shapes;
   excess-key checks against a union literal are weaker (TS checks the excess
   key against the union as a whole). Rare in practice; note it.
6. **Input vs output** (§4.1) — must be settled before the emitter is written;
   changing it later changes every call site's accepted shape.
7. **h3 v2 / Nitro v3 drift**: if Nitro v3 ever lifts `_RequestT` into
   `InternalApi` (no evidence yet), the map becomes redundant and should be
   removed per the platform-alignment posture; the `Lowercase<M>` normalisation
   also protects against the flagged uppercase `RouterMethod` change.
8. **`params`** alias and `Request` objects are the two ways around the check;
   both are handled in §4.2 / §2.2 but were only partly covered by the
   experiment (`Request` yes, `params` no).
