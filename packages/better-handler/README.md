# Better Handler

Declare a Nitro handler's request schemas, response schema and expected failures once, and get all of them typed at every call site.

A route states its whole contract in one place: what it reads (`input`), what it answers (`output`) and what it can fail with (`errors`). The handler receives validated values and two helpers, `respond` and `fail`. Every call site, through the `useBetterFetch` family, gets the request typed from the schemas' input types, the response from the declared output, and the failures as a union it handles by `_tag`. Schemas are any [Standard Schema](https://standardschema.dev) library's: zod, valibot, Effect, or your own.

This README is the interim documentation for the package and states every rule the package enforces. Why the package is shaped this way is in [`docs/`](./docs/README.md); how it is built is in [`INTERNALS.md`](./INTERNALS.md).

- [Quick start](#quick-start)
- [The Handler context](#the-handler-context)
- [The contract a route declares](#the-contract-a-route-declares)
- [Raising a Known error](#raising-a-known-error)
- [Effect](#effect)
- [Request typing](#request-typing)
- [Fetching](#fetching)
- [The wire](#the-wire)
- [Observability](#observability)
- [Development checks](#development-checks)
- [Compatibility](#compatibility)
- [Troubleshooting](#troubleshooting)
- [API reference](#api-reference)

## Quick start

```sh
pnpm add @dphonys/better-handler
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@dphonys/better-handler'],
})
```

A route declares what it reads, what it answers and what it can fail with:

```ts
// server/api/orders/[id].get.ts
import { z } from 'zod'

export default defineBetterEventHandler(
  {
    input: { route: z.object({ id: z.coerce.number().int() }) },
    output: z.object({ id: z.number(), total: z.number() }),
    errors: {
      'order-not-found': { status: 404, schema: z.object({ id: z.number() }) },
      'order-locked': { status: 409 },
    },
  },
  async (_event, { route, fail }) => {
    const order = await findOrder(route.id)

    if (!order) throw fail('order-not-found', { id: route.id })
    if (order.locked) throw fail('order-locked')

    return { id: order.id, total: order.total }
  }
)
```

A call site gets the response and every failure typed from the route path:

```ts
async function describeOrder(id: number): Promise<string> {
  const { data, error } = await $betterFetch.try(`/api/orders/${id}`)

  if (error) {
    switch (error._tag) {
      case 'order-not-found':
        return `no order ${error.id}`
      case 'order-locked':
        return 'try again later'
      case 'validation-failed':
        return error.issues.map((issue) => issue.message).join(', ')
      case 'request-failed':
        return `failed with ${error.status ?? 'no response'}`
    }
  }

  return `order ${data.id} costs ${data.total}`
}
```

`validation-failed` is there because the route declares `input`; `request-failed` is there on every call. Run `nuxt prepare` (or start the dev server) once after adding a route: the types come from a map Nuxt generates from your routes.

### Registration and configuration

```ts
export default defineNuxtConfig({
  modules: ['@dphonys/better-handler'],
  betterHandler: {
    devChecks: true,
  },
})
```

| Option      | Type      | Default | Description                                                                                                                                                                                                                                                   |
| ----------- | --------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `devChecks` | `boolean` | `true`  | Whether a development server runs the three [development checks](#development-checks): the response against the route's `output`, a thrown Known error's fields against its schema, and a thrown `_tag` the route never declared. Production never runs them. |

`devChecks` is the module's only option; any other key under `betterHandler` is a compile error in `nuxt.config.ts`.

The module auto-imports `defineBetterEventHandler`, `defineError` and `recognizeKnownError` on the server, and the five composables in the app. It installs the `$betterFetch` global on both sides and `event.$betterFetch` on every request. `matchError` is imported from `@dphonys/better-handler/shared`, never auto-imported, so code in an app's `shared/` directory can use it too.

## The Handler context

The handler's second parameter is the Handler context. It is flat, a fresh object per request, and holds exactly what the route declared:

| Key       | Present when                       | Holds                                                 |
| --------- | ---------------------------------- | ----------------------------------------------------- |
| `route`   | `input.route` is declared          | the route params, validated: the schema's output type |
| `query`   | `input.query` is declared          | the query, validated                                  |
| `headers` | `input.headers` is declared        | the request headers, validated                        |
| `body`    | `input.body` is declared           | the request body, validated                           |
| `respond` | `output` is a status map           | the Respond helper, `respond(status, value)`          |
| `fail`    | `errors` declares at least one tag | the Fail helper, `fail(tag, fields)`                  |

What a route does not declare is absent, not `undefined`: reading `context.body` on a route that declares no body is a compile error. The context holds each source's schema **output**, coercions and transforms applied. It is the only door to validated values: `readBody(event)` inside the handler returns h3's memoized parse, unvalidated, and the handler's `event` is h3's plain `H3Event`, which claims nothing about the request.

## The contract a route declares

`defineBetterEventHandler(options, handler)` takes three optional declarations, `input`, `output` and `errors`, and a route declares at least one. An empty map (`input: {}`, `errors: {}`, `output: {}`) declares nothing. A route that declares none is refused at compile time and, for a caller the types never saw, when the route module loads.

The declarations are checked when the route module is evaluated, so a misdeclared route throws before it serves anything. A misdeclared route reports the same fault whatever order its keys were written in: the options are checked first (an object, with an `errors` that is a map), then `errors`, then `input`, then `output`, and last whether the route declares anything.

### `input`

`input` maps a Validation source to a schema, or to a non-empty tuple of schemas:

```ts
export default defineBetterEventHandler(
  {
    input: {
      route: z.object({ id: z.string() }),
      query: [pagination, sorting],
      headers: z.object({ 'x-tenant': z.string() }),
      body: z.object({ total: z.number().nonnegative() }),
    },
  },
  (_event, { route, query, headers, body }) => ({ ok: true })
)
```

- **The sources are `route`, `query`, `headers` and `body`.** Any other key is refused, at compile time and at declaration. A slot left `undefined` declares nothing.
- **Each slot is a Standard Schema or a non-empty tuple of them.** Anything else is refused at declaration, naming the source and, in a tuple, the index.
- **Sources are validated before the handler is entered**, in the order `route`, `query`, `headers`, `body`, whatever order the declaration names them in. The first source with issues answers `400` with the [Built-in validation-failed variant](#the-wire), and the sources after it, the body included, are never read.
- **Within a source every issue arrives together.** A tuple runs every element, one after another in tuple order, each against the whole source, and their issues are reported together.
- **A tuple's outputs are merged into one value.** Every element must produce an object (not a primitive, an array or a function), and no two elements may produce the same key; both are compile errors at the source key. Merge overlapping schemas in your schema library instead. At runtime an element whose output is not a plain object answers a plain `500`; this catches what the types could not see, such as a `z.custom` that claims an object.
- **A lone schema, bare or a tuple of one, passes its output through untouched**, so a body may be an array or a primitive.
- **Each source reaches its schema exactly as h3 yields it**, nothing coerced on the way: route params URL-decoded, a catch-all slash-joined under one key; query values `string | string[]`; header keys lowercased, so a headers schema names them in lower case. Coercion belongs in the schema (`z.coerce.number()` and the like).
- **The body is read only on `POST`, `PUT`, `PATCH` and `DELETE`**, through h3's strict body read. On any other method, and for an empty body, a declared body schema validates `undefined`. A body h3 refuses to parse, such as malformed JSON, is one body issue, `Request body could not be parsed`, with an empty `path`; a `5xx` or a dropped connection during the read propagates untouched.
- **A schema that reports a failure with no issues** (`{ issues: [] }`) answers a plain `500` naming the route, the source and the element; a `validate` that throws propagates as it was thrown. Asynchronous schemas are awaited.
- **A route without `input` validates nothing and never reads the body**, so an `errors`-only route costs no parsing.
- **A route with `input` carries the Built-in validation-failed variant** in its typed error union, beside whatever it declares in `errors`.

Declare `input` inline or with `satisfies InputDeclaration`; never annotate it as `InputDeclaration`. The annotation makes every slot optional, so no source is guaranteed and the context holds none (see [Troubleshooting](#troubleshooting)).

### `output`

`output` declares what a route answers, in one of two forms.

**The bare form** is one schema, one `200` reply, returned plainly:

```ts
export default defineBetterEventHandler(
  { output: z.object({ ok: z.literal(true), at: z.iso.datetime() }) },
  () => ({ ok: true as const, at: new Date().toISOString() })
)
```

The handler must return the schema's output type, and the route answers `200` whatever status the handler or a middleware set before.

**The map form** maps a status to a schema, or to `null` for a status with no body, and the handler answers through the Respond helper:

```ts
export default defineBetterEventHandler(
  {
    input: { body: z.object({ total: z.number() }) },
    output: { 201: receipt, 204: null },
  },
  (_event, { body, respond }) => {
    if (body.total === 0) return respond(204)

    return respond(201, {
      id: 7,
      total: body.total,
      at: '2026-10-25T00:00:00Z',
    })
  }
)
```

- **`respond(status, value)` pairs a declared status with that status's body** at compile time; `respond(status)` answers a status declared `null`. Another status, a wrong value, a value for a `null` status or a missing one is a compile error.
- **A map-form handler must return the Respond helper's result.** A plain return is a compile error, and at runtime it answers a plain `500`, in production too, since no status can be read off it.
- **A status declared `null` sends no body**, whatever a JavaScript caller passed.
- **A `200` with no body stays `200`.** A map's `200: null`, or a bare form whose schema admits `null` and whose handler returns `null`, answers `200` with no body and no `content-type`, not h3's `204`.
- **A map key is a status in plain decimal, from `100` to `599`**, and each value a Standard Schema or `null`; anything else is refused at declaration.
- **Nothing runs the output schema in production.** The handed-over value is sent as it is. A development server asserts it against the schema and discards the result, so both send the same bytes; see [Development checks](#development-checks).
- **The client receives the schemas' output types as JSON carries them** (a `Date` arrives as a `string`): the bare schema's type, or the union of the map's bodies, `null` for a bodiless status. A route without `output` is typed by what its handler returns, as any Nitro handler is.

### `errors`

`errors` maps a tag to an Error declaration, `{ status, schema? }`:

```ts
export default defineBetterEventHandler(
  {
    errors: {
      'order-not-found': { status: 404, schema: z.object({ id: z.number() }) },
      'order-locked': { status: 409 },
      ...commonErrors,
    },
  },
  (_event, { fail }) => {
    throw fail('order-locked')
  }
)
```

- **A tag is any non-empty string literal**, written as a string key; a numeric key is refused. The package's own tags are kebab-case; yours need not be.
- **`validation-failed` and `request-failed` are reserved** for the package's built-in variants. Declaring either is a compile error and a declaration-time throw, on every route.
- **`status` is an integer from `400` to `599`.** Two tags may share a status.
- **`schema`, when given, is a Standard Schema describing the fields beside `_tag`.** Its output must be an object of fields. If the output carries a `_tag` literal, it must equal the key. A field holding a `bigint` or a `symbol`, at any depth, is refused, since the fields go out as JSON. A tag declared without a schema is typed as the tag alone, and `fail` gives it no fields.
- **An entry takes `status` and `schema` and nothing else.** Any other key is refused.
- **A route with `errors` gets the Fail helper**; one without has none.

**Reuse is object spread.** `defineError(tag, entry)` checks one declaration where it is written and returns a one-key map, so it spreads into any route beside others:

```ts
// server/errors/common.ts
export const commonErrors = {
  ...defineError('unauthorized', { status: 401 }),
  ...defineError('forbidden', {
    status: 403,
    schema: z.object({ requiredRole: z.enum(['admin', 'owner']) }),
  }),
}
```

`defineError`'s tag must be one string literal. Under spread, a tag written twice is an ordinary later-key-wins merge.

**Narrowing is `Pick`.** `const onlyUnauthorized: Pick<typeof commonErrors, 'unauthorized'> = commonErrors` gives a route the `unauthorized` tag alone in its types: `fail('forbidden')` is a compile error and its call sites never see `forbidden`. `Pick` narrows the type only: the object handed over is still the whole map, so a value thrown with `_tag: 'forbidden'` still goes out as a Known error. To narrow both, spread only the declarations the route keeps.

## Raising a Known error

A Known error is a failure a route declares. It goes out with its declared status and the Tagged error, `{ _tag, ...fields }`, as the body's `data`. There are two ways to raise one.

**The Fail helper.** `fail(tag, fields)` pairs a declared tag with the fields its schema describes, at compile time, exactly as `respond` pairs a status with its body. A tag declared without a schema takes no fields: `fail('order-locked')`. It returns an `Error` carrying `_tag` and the fields, so there is a stack trace; the handler `throw`s it.

```ts
if (!order) throw fail('order-not-found', { id: route.id })
```

An undeclared tag, `validation-failed` included, missing fields, wrong fields, or fields for a schema-less tag are compile errors. A JavaScript caller that gets past them gets a plain `500` naming the mistake. A field named `message`, `name`, `stack` or `cause` is a field like any other.

**Any thrown value with a declared `_tag`.** The route's boundary reads the `_tag` of whatever the handler throws, on the value itself or its prototype. A string `_tag` the route declares makes the value a Known error: an instance of your own error class, an Effect error (see [Effect](#effect)), or a plain object.

```ts
class OrderMissing extends Error {
  readonly _tag = 'order-not-found'

  constructor(readonly id: number) {
    super('the order is gone')
  }
}

// In a route declaring 'order-not-found':
throw new OrderMissing(route.id)
```

The rules of the boundary:

- **The status always comes from the declaration**, never from the thrown value.
- **Everything else propagates untouched**: a value with no string `_tag`, an h3 error, a `TypeError`.
- **A string `_tag` the route does not declare** is refused on a development server with a plain `500` naming the thrown tag and the declared ones. In production it propagates untouched. This check runs only on routes that declare `errors`.
- **A route without `errors` has no boundary**: whatever its handler throws propagates as it was thrown, a tagged value included.

**What goes out.** `data` is `{ _tag, ...every own enumerable property of the thrown value }` through JSON, whatever the schema declares. The `_tag` is the declared one, and no field can displace it. Function-valued properties are left out, as JSON would leave them out. Properties on the prototype, such as a class's methods, and an `Error`'s own `message`, `stack` and `name`, which are not enumerable, never go out.

Nothing runs the error's schema in production, and a schema that strips unknown keys strips nothing here: the development check validates the fields and discards the result, so a stripping schema lets extra fields through to the wire unreported. **Hand `fail` and a thrown value only what the client may see.** Passing a whole database row to `fail` sends every column.

## Effect

An Effect error class is a route's Error declaration as it is. Declare it with `Schema.toStandardSchemaV1(MyError)` as the entry's schema, under its own tag, and throw the instance:

<!-- lifted from playground/server/api/effect.get.ts -->

<!-- eslint-skip -->

```ts
import { Schema } from 'effect'

/** An Effect error class: its own Standard Schema is the declaration. */
class OrderMissing extends Schema.TaggedError<OrderMissing>()('OrderMissing', {
  id: Schema.Number,
}) {}

export default defineBetterEventHandler(
  {
    errors: {
      OrderMissing: {
        status: 404,
        schema: Schema.toStandardSchemaV1(OrderMissing),
      },
    },
  },
  () => {
    throw new OrderMissing({ id: 7 })
  }
)
```

The route answers `404` with `data: { _tag: 'OrderMissing', id: 7 }`, and its call sites see `{ _tag: 'OrderMissing'; readonly id: number }`: the class's methods and Effect's own markers are not fields.

- **Effect is not a dependency of this package.** The package reads the class through Standard Schema alone; install `effect` in your app.
- **The class is `Schema.TaggedError<Self>()(tag, fields)`**, as Effect 4.0.6 names its tagged error class builder. The route declares it under the class's own tag: the schema's `_tag` must equal the key, so another key is a compile error.
- **The development check validates the whole Tagged error, `_tag` included**, against the class's schema, which requires `_tag`.
- **A field named `message` never goes out.** Effect keeps it non-enumerable, so the development check reports it missing.

## Request typing

Every call site of a route is typed from the route's declared schemas, through two mechanisms.

**The `useBetterFetch` family, on every Nuxt 4.** `$betterFetch`, `event.$betterFetch` and the five composables read a map Nuxt generates from your routes, and type `body`, `query` and `headers` per route and method from the declared schemas' input types, identically from Nuxt 4.0.0 up.

**Nuxt's own `$fetch` and `useFetch`, on Nuxt 4.6 and later, when the app sets `experimental.routeTypedFetch: true`.** The handler `defineBetterEventHandler` returns fills h3's `H3Event<Request>` slot with the declared `body` and `query` input types, which Nuxt's typed fetch reads. Array, primitive and other non-record bodies and queries stay vanilla there, as Nuxt reads records only, while the family types them. The module never reads or sets the flag.

The family's rules, which `BetterRequestOptions<R, M>` spells:

- **Typed per route and method.** The method defaults to `get` when the route has one, else to the methods it has (Nuxt's own rule), and may be written in either case: `'post'` or `'POST'`, not `'Post'`.
- **The input types, not the handler's.** A call site sends what the schema accepts before its transforms: a query declared `z.string().transform(Number)` takes a `string` at the call site and arrives as a `number` in the handler.
- **A declared source is required unless `{}` fits its input type.** An all-optional schema stays optional but typed.
- **A `body` or `query` key the schema does not name is refused**, on a plain object literal.
- **A declared `body` replaces vanilla's**, so a string or `FormData` is refused where the schema describes an object.
- **Declared `headers` type the keys they name, and every other header stays an open string**: a client sends more headers than a route validates. Declared headers are a plain record, never a `Headers` object or a list of pairs.
- **A route of this package takes no `body` on `get` or `head`.**
- **`route` is never an option**: the path carries it. ofetch's deprecated `params` alias is gone on every route, as it would bypass the query's checks.
- **An undeclared source is vanilla's own**, whatever else the route declares, and **a route this package does not type keeps vanilla's options key for key**, `body` on `get` included.

What the types cannot see:

- **A call with no options at all skips the requiredness check.** `$betterFetch('/api/search')` compiles even when the route requires a `query`, a known limit of the typing; the route answers `validation-failed`.
- **A reactive source loses the excess-key check.** On the composables a plain object literal is checked for extra keys; the same value behind a `ref()` or a getter is not, though its values' types still are.
- **`$betterFetch<T, R, M>` is not type-argument-compatible with `$fetch<T, R, O>`.** A call that names its type arguments explicitly passes the method, not the options.

On the native path, beyond arrays and primitives, the known differences from the family are:

- **A `z.coerce` query** is typed natively, its keys checked, with each coerce value widened to any query value.
- **Two handlers on one route and method**: Nuxt types neither, while the family accepts either handler's input.
- **A body admitting `undefined`**: Nuxt drops the `undefined`.
- **A body that is a union of records and non-records**: Nuxt keeps the records.
- **Requiredness is Nuxt's own**, and **`headers` are not typed natively**: Nitro carries the body and the query only.
- **Known errors stay the family's.** Nuxt's `useFetch` error remains `NuxtError<unknown>`; the failure union is typed only through the family.

Where the two can both be exact, the package's suite asserts they agree; where they differ, the family is the more precise one, and it is never made less precise to match.

## Fetching

| Member                                         | Where                           | What it is                                                                       |
| ---------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------- |
| `$betterFetch(request, opts)`                  | anywhere: app, Nitro, `shared/` | `$fetch`, typed: resolves the response, rejects with the route's `KnownErrorFor` |
| `$betterFetch.try(request, opts)`              | anywhere                        | resolves to `{ data, error }` instead of throwing                                |
| `$betterFetch.raw`, `.native`, `.create`       | anywhere                        | as on `$fetch`; `.create(defaults)` keeps `.try`, and its defaults are vanilla   |
| `event.$betterFetch`, `.try`                   | a Nitro handler                 | the same call and `.try`, forwarding the request's headers and cookies           |
| `useBetterFetch`, `useLazyBetterFetch`         | app, auto-imported              | `useFetch`/`useLazyFetch` with typed request options and a typed `error` ref     |
| `useBetterAsyncData`, `useLazyBetterAsyncData` | app, auto-imported              | `useAsyncData`/`useLazyAsyncData` over a `.try` handler                          |
| `useRequestBetterFetch()`                      | app, auto-imported              | while rendering, the request's `event.$betterFetch`; elsewhere, `$betterFetch`   |

`$betterFetch` is a global, available with no import in a Nitro handler, in `<script setup>` and in an app's `shared/` directory. `.create(defaults)` takes vanilla options, so a default `query` never relaxes a call's own requiredness.

### `.try` and the error union

```ts
async function invoiceTotal(): Promise<number | undefined> {
  const { data, error } = await $betterFetch.try('/api/invoices/7')

  if (error) {
    report(error)
    return undefined
  }

  return data.total
}
```

`.try` resolves to `{ data, error: undefined }` or `{ data: undefined, error }`; checking `error` narrows `data`. `error` is exhaustive on `_tag`:

- **each Known error the route declares for that method**, `{ _tag, ...fields }`, the fields being the schema's output as JSON carries it;
- **`validation-failed`**, `{ _tag: 'validation-failed', issues }`, on a route that declares `input`;
- **`request-failed`**, `{ _tag: 'request-failed', status: number | undefined, cause: NuxtError }`, for every other failure: a network error, an abort, a status nobody declared, a body that carries no Tagged error. `status` is the response's, `undefined` when no response arrived; `cause` is the failure as a `NuxtError`.

A route this package does not type has `request-failed` alone. A `switch` over `error._tag` needs no `default`.

### `matchError`

```ts
import { matchError } from '@dphonys/better-handler/shared'

const { error } = await $betterFetch.try('/api/orders/7')

matchError(
  error,
  {
    'order-not-found': ({ id }) => notFound(id),
    'order-locked': () => retryLater(),
    'validation-failed': ({ issues }) => showIssues(issues),
    'request-failed': ({ status }) => offline(status),
  },
  (unknown) => report(unknown._tag)
)
```

`matchError(error, arms, fallback)` calls the arm for the error's `_tag`:

- **Every variant needs an arm**, `request-failed` included; a missing arm, or an arm for a tag the error cannot carry, is a compile error.
- **The `fallback` is required.** It is called with any error whose `_tag` has no arm: a tag this call site does not know, such as one a newer server sends after a deploy, or a hand-rolled `data._tag`. The types cannot see these; the fallback catches them.
- **It takes a `.try` error as it is, and a fetched `NuxtError`** (a composable's `error` ref, a caught rejection) through the same classifier `.try` uses.
- **A ref is read once, when called.** The reactive form is `watch(error, () => matchError(error, …))`.
- **A nullish error is no failure**, and nothing is called.

### The composables

```ts
const { data, error } = await useBetterFetch('/api/users', {
  method: 'POST',
  body: { name, age: 36 },
})

const { data: invoice } = await useBetterAsyncData('invoice', () =>
  $betterFetch.try('/api/invoices/7')
)
```

- **`useBetterFetch` and `useLazyBetterFetch` take Nuxt's own `useFetch` options**, with `body`, `query` and `headers` typed as above and accepted plain, through a ref or through a getter. Their `error` ref is `KnownErrorFor<route, method>`: a `NuxtError` whose `data` is Nitro's error body, the Tagged error at `error.value.data.data`. Hand the ref to `matchError` to handle it by `_tag`.
- **`useBetterAsyncData`'s handler must resolve to a `.try` result**, such as `$betterFetch.try(…)`. A success becomes `data`; a failure is thrown as the `NuxtError` it was read off, so the `error` ref keeps the response's status and body.
- **The compiler keys them as it keys `useFetch` and `useAsyncData`.** Call them through their auto-imports; on Nuxt 4.0 the compiler keys only auto-imported calls.

### The `accept` header

Every member of the family sends `accept: application/json`. Nitro answers an error as JSON outside `/api/**` only to a request that asks for JSON, so without it a Known error from a route under `server/routes/` would arrive as an HTML page and read as `request-failed`. A caller's own `accept`, per call or per `.create` instance, wins. The family sends no other header of its own.

### `event.$betterFetch`

```ts
export default defineEventHandler(async (event) => {
  const order = await event.$betterFetch('/api/orders/7')
  const missing = await event.$betterFetch.try('/api/orders/404')

  return { total: order.total, missing: missing.error?._tag }
})
```

It is the call and `.try` only, typed as the global is, and forwards the incoming request's headers and cookies as Nitro's `event.$fetch` does, whose experimental API it wraps.

## The wire

**A Known error** answers its declared status with Nitro's ordinary error body:

```text
404
{
  "error": true,
  "url": "/api/orders/404",
  "statusCode": 404,
  "statusMessage": <Nitro's own>,
  "message": "order-not-found",
  "data": { "_tag": "order-not-found", "id": 404 }
}
```

`message` is the tag and `data` the Tagged error, flat: no wrapper key, and no status inside `data`. `statusMessage` is Nitro's own; the package never sets it. A development server adds Nitro's `stack`.

**The Built-in validation-failed variant** answers `400` with the same body, `message` and `_tag` both `validation-failed`, and the issues of the one source that failed:

```text
400
{
  …,
  "message": "validation-failed",
  "data": {
    "_tag": "validation-failed",
    "issues": [
      { "source": "body", "message": "name is required", "path": ["name"] },
      { "source": "body", "message": "age must be at least 18", "path": ["age"] }
    ]
  }
}
```

Each issue is `{ source, message, path }`: the source that failed, the schema's message, and the path into that source as a list of keys and indexes.

- **Every caller receives the same body.** No header, cookie or credential changes what a Known error carries.
- **A development server and a production build send the same Known error**, apart from Nitro's `stack`, unless a [development check](#development-checks) refuses it.
- **A fetched error carries the Tagged error at `error.data.data`**: ofetch's `data` is the whole body.
- **A developer's mistake is a plain `500`** whose `message` starts with `[better-handler]` and which has no `data`, so it is never a Known error and never reads as one.
- **Nitro's error hooks see the thrown error untouched.**

## Observability

`recognizeKnownError(error)` hands back the Tagged error a Known error carries, or `undefined`:

```ts
// server/plugins/observability.ts
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error) => {
    const tagged = recognizeKnownError(error)

    if (tagged?._tag === 'validation-failed') return
    if (tagged !== undefined) return countExpected(tagged._tag)

    report(error)
  })
})
```

It is the one recognizer: validation is `_tag === 'validation-failed'`. It takes an `Error`, which every Nitro hook hands over; narrow a tracker's `unknown` (Sentry's `hint.originalException`) with `instanceof Error` first. It reads the error's own `data` only, so a developer fault is never recognised, and neither is a callee's Known error a caller let escape: the caller's answer carries the callee's whole body as its `data`, the tag one level further down, and that is the caller's bug, which keeps reporting.

## Development checks

A development server runs three checks, all behind the `devChecks` option. Each refuses with a plain `500` naming the route, never a Known error. A production build runs none of them and sends what the handler handed over; `devChecks: false` makes a development server answer as production does.

1. **The response check.** The value a handler hands over (the bare form's return, or the value inside `respond(status, value)`) is validated against the schema its status declares, and the result discarded, so a development server sends the bytes production sends. A status the map does not declare is refused before it reaches the response. A status declared `null` has nothing to check.
2. **The thrown-fields check.** A Known error's Tagged error, about to go out, is validated against its declared schema and the result discarded. It catches wrong and missing fields; a schema that strips unknown keys reports no extra ones, which go out as thrown. The schema is handed the whole Tagged error, `_tag` included, so a strict schema, one that refuses unknown keys, must list `_tag`.
3. **The undeclared-tag check.** A thrown value with a string `_tag` the route does not declare is refused, naming the tag and the declared ones; the thrown value is kept as the fault's `cause` for the logs. It runs only on routes that declare `errors`.

A schema that throws instead of reporting issues is refused the same way, with what it threw as the `cause`. Asynchronous schemas are awaited. Each sentence is quoted under [Troubleshooting](#troubleshooting).

## Compatibility

Every Nuxt 4 (`>=4.0.0 <5.0.0`).

Every feature works identically from Nuxt 4.0.0 up, with one additive layer on 4.6 and later: Nuxt's own `$fetch` and `useFetch` type `body` and `query` on this package's routes when the app turns `experimental.routeTypedFetch` on. Nothing else depends on the Nuxt version. Nuxt 5 support is planned as an adapter, not yet built.

CI holds that range at both edges. The default jobs install the committed lockfile, which pins the latest 4.x. On every push to `main` and every pull request, the `Nuxt 4.0 floor` job also runs this package's typecheck and tests with `nuxt`, `@nuxt/kit` and `@nuxt/schema` 4.0.x installed in their place, without changing the committed lockfile, and must pass.

- **The generated type map** augments `@dphonys/better-handler/types` from `.nuxt/types/better-handler.d.ts`. Nothing is hoisted and no tsconfig is edited: the package's `exports` resolves the specifier from every generated tsconfig.
- **The route ceiling.** The family's types read responses through Nitro's route types (`InternalApi`), on which a call site hits `TS2589` somewhere between 176 and 201 routes, as vanilla `$fetch` does on that engine. The ceiling is accepted; it lifts with the Nuxt 5 adapter, which reads Nuxt's generated route engine.
- **Composable keys on Nuxt 4.0.** The compiler keys only auto-imported calls of the composables there.

## Troubleshooting

### A compile error inside a type named `…Error<"…">`

The package's own compile-time rules arrive as a sentence inside a type, at the key that broke them. Each sentence below is verbatim:

```text
HandlerDeclarationError<"declare input, errors, output, or any combination">
ErrorDeclarationError<"validation-failed is reserved for the built-in variant - rename the declared error">
ErrorDeclarationError<"request-failed is reserved for the built-in variant - rename the declared error">
ErrorDeclarationError<"an error tag must be a non-empty string">
ErrorDeclarationError<"an error tag must be one string literal">
ErrorDeclarationError<"an error tag must be a string key - quote a numeric one">
ErrorDeclarationError<"the schema's output has _tag order-missing, which must equal the tag order-not-found">
ErrorDeclarationError<"the schema must describe an object of fields beside _tag">
ErrorDeclarationError<"payload is not an error entry key - an entry takes status and schema">
ErrorDeclarationError<"the status must be an integer from 400 to 599, not 302">
ErrorDeclarationError<"the field total cannot go out as JSON - it holds a bigint or a symbol">
InputDeclarationError<"quary is not a validation source - the sources are route, query, headers and body">
InputDeclarationError<"schemas composed on one source must produce disjoint output keys - merge them in your schema library instead">
InputDeclarationError<"every schema composed on one source must produce an object output - not a primitive, an array or a function">
AsyncDataHandlerError<"resolve to a .try result, such as $betterFetch.try(…)">
```

- `HandlerDeclarationError` is at the options: the route declares nothing, or only empty maps.
- `ErrorDeclarationError` is at the offending tag, `status` or entry key, in a route's `errors` or a `defineError` call. A migrating `payload:` key is refused so it never silently means "no schema".
- `InputDeclarationError` is at the offending source key. A misspelled key standing alone in `input` is refused by TypeScript's own check instead: `Object literal may only specify known properties, and 'routerParams' does not exist in type 'InputDeclaration & InputGuard<InputDeclaration>'.`
- `AsyncDataHandlerError` is at a `useBetterAsyncData` handler that does not resolve to a `.try` result.

The pairings are TypeScript's own sentences, quoted from the package's compile fixtures; the route names and types in them are the fixtures'.

- `fail` with a tag the route does not declare, `validation-failed` included:

  ```text
  Argument of type '"order-unknown"' is not assignable to parameter of type '"order-locked" | "order-not-found"'.
  ```

- `fail('order-not-found')` without the fields its schema describes: `Expected 2 arguments, but got 1.`
- `fail('order-locked', { id: 7 })` for a tag declared without a schema: `Expected 1 arguments, but got 2.`
- `respond` under a status the map does not declare:

  ```text
  Argument of type '404' is not assignable to parameter of type '200 | 201'.
  ```

- `respond(204, value)` where `204` is declared `null`: `Expected 1 arguments, but got 2.`
- `respond(200)` where `200` declares a body: `Expected 2 arguments, but got 1.`
- A plain return from a map-form handler:

  ```text
  Type '{ id: string; }' is not assignable to type 'EventHandlerResponse<Responded<{ 200: { id: string; }; 201: { id: string; createdAt: string; }; }>>'.
  ```

- `respond` on a bare-form route:

  ```text
  Property 'respond' does not exist on type 'HandlerContext<{}, {}, ZodObject<{ id: ZodString; }, $strip>>'.
  ```

- A source or helper the route does not declare, such as `context.body` or `context.fail`, is `Property 'body' does not exist on type 'HandlerContext<…>'`, the context's type arguments being the route's declarations.
- `matchError` without the fallback: `Expected 3 arguments, but got 2.`
- `matchError` with an arm missing:

  ```text
  Property '"order-locked"' is missing in type '{ 'order-not-found': () => void; 'request-failed': () => void; }' but required in type 'ErrorArms<{ _tag: "order-not-found"; id: number; } | { _tag: "order-locked"; } | RequestFailed>'.
  ```

### The context holds no source although `input` declares one

```ts
// Wrong: annotated, every slot is optional, so the context holds no source.
const input: InputDeclaration = { query: pagination }

// Right: the inferred literal is what the context is computed from.
const input = { query: pagination } satisfies InputDeclaration
```

The annotation throws away the literal the inference needs. The route still validates what the object holds, and still carries `validation-failed`.

### A route module throws when it loads

A misdeclaration the types did not see (a JavaScript route, an `any`-typed value) throws a plain `Error` when the route module is evaluated, before the route serves anything. The sentences, as the package's tests assert them:

```text
[better-handler] defineBetterEventHandler takes its declarations as an object, not null.
[better-handler] The errors of defineBetterEventHandler must be a map of error declarations keyed by tag, not an array.
[better-handler] An error tag must be a non-empty string - rename the error declared under the empty key.
[better-handler] An error tag must be a non-empty string, not the primitive 404.
[better-handler] The error tag "validation-failed" is reserved for the built-in validation-failed variant. Rename the declared error.
[better-handler] The schema of error "order-not-found" must be a Standard Schema, not an empty object.
[better-handler] Error "order-not-found" must be declared as { status, schema? }, not the primitive 404.
[better-handler] The status of error "order-not-found" must be an integer from 400 to 599, not the primitive 399.
[better-handler] Error "order-not-found" declares an unknown key "payload". An entry takes status and schema only.
[better-handler] The input of defineBetterEventHandler must be a map of schemas keyed by validation source, not an array.
[better-handler] The input declares "routerParams", which is not a validation source - the sources are route, query, headers and body.
[better-handler] The body input must be a Standard Schema or a non-empty tuple of them, not a function.
[better-handler] The query input holds a plain object at index 1, which is not a Standard Schema.
[better-handler] The headers input is an empty tuple. Declare at least one schema, or remove the key.
[better-handler] The output of defineBetterEventHandler must be a Standard Schema, for one 200 reply returned plainly, or a map from status to schema, not an instance of Map.
[better-handler] The output's key "600" must be a status, an integer from 100 to 599.
[better-handler] The output for status 201 must be a Standard Schema, or null for a reply with no body, not a plain object.
[better-handler] defineBetterEventHandler must declare input, errors, output, or any combination.
```

Within `errors` the rules run one at a time over every entry: a reserved or empty tag, then a schema that is not a Standard Schema, then a status out of range, then a key an entry does not take.

### A request answers a plain `500` starting with `[better-handler]`

A developer's mistake found while serving a request. These three answer in production too:

```text
[better-handler] fail("order-unknown") names no error this route declares. The route declares "order-not-found", "order-locked".
[better-handler] fail("order-locked") takes no fields: the error is declared without a schema, and was handed a plain object.
[better-handler] cannot send the response: GET /api/receipts declares a status map, so it must return the Respond helper's result, and a plain object is not one. Return respond(status, value) - or respond(status) for a status declared null - from the Handler.
```

So do these two, about a schema that broke the Standard Schema contract or a tuple whose outputs cannot merge:

```text
[better-handler] cannot validate the query of GET /api/test: the schema reported a failure with no issues. A Standard Schema answers with a value or with at least one issue, so this result names neither a value to hand the Handler nor a reason to reject the request.
[better-handler] cannot merge the validated query of GET /api/test: the schema at index 1 produced the primitive not an object at all. Schemas composed on one source merge their outputs, so every element of the tuple must produce a plain object.
```

These come from the [development checks](#development-checks), on a development server only:

```text
[better-handler] cannot send the response: GET /api/receipts answered 200 with a value its declared Response output rejects - id: Invalid input: expected string, received number; total: Invalid input: expected number, received string. Nothing checks the response in production, so this route would send that value as it is: fix the handler or the schema, or set `devChecks: false`.
[better-handler] cannot send the response: GET /api/receipts answered 404, a status its declared Response output never names - the map names 200, 201. Nothing checks the response in production, so this route would send that status as it is: respond under one of those, or name 404 in `output`, or set `devChecks: false`.
[better-handler] cannot send the response: GET /api/receipts answered 200, and the schema its Response output declares threw while checking the value instead of reporting issues - the cause is what it threw. Nothing runs the schema in production, so this route would send the value unchecked: fix the schema, or set `devChecks: false`.
[better-handler] cannot send the error: GET /api/orders/7 threw "order-not-found" with fields its declared schema rejects - id: id must be a number. Nothing checks the fields in production, so this route would send them as they are: fix the handler or the schema, or set `devChecks: false`.
[better-handler] cannot send the error: GET /api/orders/7 threw "order-odd", and the schema it declares threw while checking the fields instead of reporting issues - the cause is what it threw. Nothing runs the schema in production, so this route would send the fields unchecked: fix the schema, or set `devChecks: false`.
[better-handler] cannot send the error: GET /api/orders/7 threw a value tagged "order-paid", which this route does not declare - it declares "order-not-found", "order-locked". Nothing checks this in production, where the value propagates as it was thrown: declare the tag in `errors` or throw a declared one, or set `devChecks: false`.
```

### A `fail(…)` call does nothing

`fail` returns the error; it does not throw it. Write `throw fail('order-locked')`; a bare `fail(…)` statement builds the error and lets the handler carry on.

### Every Known error arrives as `request-failed`

- **A custom `nitro.errorHandler` that does not serialise `data` loses every Known error.** Known errors travel as `data` on ordinary HTTP errors; an error handler that drops `data` leaves the client nothing to classify. Keep `data` in the response body.
- **A caller sent its own `accept` header** on a route outside `/api/**`, and Nitro answered with an HTML error page. Leave `accept` to the family, or ask for `application/json`.

### A Known error from a route I call is not recognised

A handler that calls another route and lets the rejection escape answers with the callee's status, but the callee's Tagged error sits one level further down, so `recognizeKnownError` does not recognise it and a `.try` reads it as `request-failed`. Catch the callee's failure with `.try` and answer with a Known error of your own route.

### `event.$betterFetch` rejects

```text
[better-handler] event.$betterFetch cannot run: this event has no `event.$fetch`. @dphonys/better-handler wraps Nitro’s experimental `event.$fetch`, and the installed Nitro or h3 no longer provides it, so the runtime is newer than the versions this package supports. Upgrade @dphonys/better-handler, or pin Nitro and h3 to a supported version.
```

The installed Nitro or h3 is newer than the package supports. `.try` rejects with this error too, rather than reading it as `request-failed`.

### `TS2589: Type instantiation is excessively deep and possibly infinite` at a call site

The app has passed the [route ceiling](#compatibility), somewhere between 176 and 201 routes, where vanilla `$fetch` fails the same way on Nitro's route types.

### The types do not know a new route

The map is generated by `nuxt prepare` and on every dev-server rebuild. Run `nuxt prepare` after adding or changing a route outside the dev server.

### A schema rejects a body another middleware already read

h3 memoises the body parse. A middleware that read the body before the route, without h3's strict parsing, wins, and the route's schema then sees what that read produced.

## API reference

### Module

| Name            | Entry                     | Role                                         |
| --------------- | ------------------------- | -------------------------------------------- |
| default export  | `@dphonys/better-handler` | the Nuxt module, `configKey` `betterHandler` |
| `ModuleOptions` | `@dphonys/better-handler` | `{ devChecks: boolean }`                     |

### Server, `@dphonys/better-handler/server` (auto-imported in `server/`)

| Name                                         | Role                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| `defineBetterEventHandler(options, handler)` | declares a route's `input`, `output` and `errors`; returns an h3 handler |
| `defineError(tag, { status, schema? })`      | one Error declaration as a one-key map, checked where it is written      |
| `recognizeKnownError(error)`                 | the Tagged error a Known error carries, or `undefined`                   |

### Shared, `@dphonys/better-handler/shared`

| Name                                | Role                                                      |
| ----------------------------------- | --------------------------------------------------------- |
| `matchError(error, arms, fallback)` | one arm per `_tag`, and a fallback for a tag no arm names |

### App (auto-imported) and globals

`useBetterFetch`, `useLazyBetterFetch`, `useBetterAsyncData`, `useLazyBetterAsyncData`, `useRequestBetterFetch`; the `$betterFetch` global with `.try`, `.raw`, `.native` and `.create`; `event.$betterFetch` with `.try`. See [Fetching](#fetching).

### Types, `@dphonys/better-handler/types`

| Group             | Names                                                                                                                                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Handler           | `BetterEventHandler`, `BetterHandlerFn`, `BetterHandlerOptions`, `HandlerContext`, `HandlerDeclarationError`                                                                                                                                                  |
| Reading a handler | `KnownErrorsOfHandler`, `RequestInputOfHandler`, `ResponseOutputOfHandler`, `RouteKnownErrors`                                                                                                                                                                |
| Errors            | `ErrorDeclarations`, `ErrorEntry`, `ErrorStatus`, `ErrorDeclarationError`, `ReservedTag`, `Fail`, `FailedError`, `TaggedError`, `KnownErrorsOf`                                                                                                               |
| Input             | `InputDeclaration`, `InputDeclarationError`, `InputGuard`, `InputOf`, `OutputOf`, `MergedInput`, `MergedOutput`, `RequestInput`, `SourceInput`, `SourceSchemas`, `SourceValue`, `ValidatedContext`, `ValidationSource`, `ValidationIssue`, `ValidationFailed` |
| Output            | `ResponseOutput`, `StatusMap`, `ResponseOutputs`, `ResponseBodies`, `HandlerReturn`, `SentResponse`, `Respond`, `Responded`                                                                                                                                   |
| Routes            | `KnownApiErrors`, `KnownApiRequestInputs` (generated, never written by hand), `KnownErrorsOfRoute`, `RequestInputOfRoute`, `Wire`                                                                                                                             |
| Fetching          | `$BetterFetch`, `BetterFetch`, `BetterFetchTry`, `BetterFetchError`, `BetterRequestOptions`, `TryResult`, `RequestFailed`, `KnownErrorBody`, `KnownErrorFor`, `KnownErrorOf`                                                                                  |
| Matching          | `MatchError`, `MatchableError`, `ErrorArms`, `VariantsOf`, `UnknownTagFallback`                                                                                                                                                                               |
| Composables       | `UseBetterFetch`, `UseBetterFetchOptions`, `UseBetterAsyncData`, `UseRequestBetterFetch`, `BetterAsyncDataHandler`, `AsyncDataHandlerError`, `AsyncDataErrorOf`, `FailureOf`, `SuccessOf`, `TrySource`                                                        |

`/types` also declares `H3Event.$betterFetch` and the global `$betterFetch`.

## Repository development

From the repository root:

```sh
pnpm --filter @dphonys/better-handler dev
pnpm --filter @dphonys/better-handler typecheck
pnpm --filter @dphonys/better-handler test
pnpm --filter @dphonys/better-handler build
pnpm --filter @dphonys/better-handler publint
```

## License

Licensed under the [MIT License](./LICENSE).
