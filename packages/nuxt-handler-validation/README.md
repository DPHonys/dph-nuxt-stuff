# Nuxt Handler Validation

Declare a Nitro handler's request schemas once, and receive the validated,
fully-typed values in the handler's second parameter - route params, query,
headers and body, checked by any [Standard Schema](https://standardschema.dev)
library _before_ the handler body runs. Failures answer with one stable,
documented wire shape, identical in development and production.

One sentence for the whole model: **a source slot takes a schema, or a tuple of
schemas; reuse is exporting a schema value; composition is writing a tuple.**

## Installation

```sh
pnpm add @dphonys/nuxt-handler-validation
```

```ts
export default defineNuxtConfig({
  modules: ['@dphonys/nuxt-handler-validation'],
})
```

That is very nearly the whole setup. The module has **one option**, the
development-only [response check](#the-development-only-response-check), which
is on by default:

```ts
export default defineNuxtConfig({
  modules: ['@dphonys/nuxt-handler-validation'],
  handlerValidation: { checkResponses: false },
})
```

Nothing about a route's request validation or its Response output is
configured; both are declared, in the route.

Bring your own schema library. Anything implementing Standard Schema works -
[zod](https://zod.dev), [valibot](https://valibot.dev),
[arktype](https://arktype.io), and others - nothing is bundled for you.

**Requirements:** Nuxt `>=4.5.1 <5.0.0`, Node 22.19+ / 24.11+ / 26+.

## Quick start

```ts
// server/api/users/[id].post.ts
import * as v from 'valibot'
import { z } from 'zod'

export default defineValidatedEventHandler(
  {
    input: {
      route: v.object({ id: v.pipe(v.string(), v.transform(Number)) }),
      query: z.object({ page: z.coerce.number() }),
      body: z.object({
        name: z.string(),
        tags: z.string().transform((s) => s.split(',')),
      }),
    },
    output: z.object({ id: z.number(), name: z.string() }),
  },
  async (event, { route, query, body }) => {
    // route: { id: number }
    // query: { page: number }
    // body:  { name: string, tags: string[] }
    return updateUser(route.id, body)
  }
)
```

- **Schemas nest under `input`**, keyed by source. The four sources are
  `route`, `query`, `headers` and `body`.
- **`output` types the success response** - one schema for a single `200`, or a
  status map for a route that answers under several statuses. See [Response
  output](#response-output). It is optional, independent of `input`, and a
  declaration in its own right: a route may declare `output` alone.
- **Validated values arrive eagerly and fully typed in the second parameter**,
  each typed as its schema's _output_ - so coercions and transforms land in the
  handler already applied. Undeclared sources are **absent** from that
  parameter, not `unknown` and not optional; reading one is a compile error
  naming the key.
- **Mix libraries freely.** zod and valibot can sit in one declaration, or even
  in one composed tuple. Async schemas are supported; the wrapper awaits them.
- **Your return type flows to Nitro's typed routes unchanged.** The wrapper
  returns a `ValidatedEventHandler` - still assignable to h3's `EventHandler`,
  carrying the route's Request input and its declared Response output as
  phantom brands - so `$fetch('/api/users/1')` infers the response exactly as
  it would with `defineEventHandler`. Nothing to unwrap. On a route that
  declares `output`, the return is additionally constrained to the schema's
  output type, and a status map's route infers as the union of its mapped
  bodies.
- `defineValidatedEventHandler` and `recognizeValidationError` are
  **auto-imported inside `server/`**, the same ambient position as
  `defineEventHandler`. Import them from
  `@dphonys/nuxt-handler-validation/server` where auto-imports do not reach -
  Nitro plugins and tasks, tests, non-Nuxt Nitro apps,
  `imports.autoImport: false`. That entry carries the runtime and depends on
  h3, so never import it from client code; use
  `@dphonys/nuxt-handler-validation/types` for types in app code.

### The second parameter is the only door

Each source is read **once** per request, before your handler body runs.
Calling `readBody(event)` afterwards hands back h3's memoized _unvalidated_
parse - not what your schema produced. Read what you declared from the second
parameter and nothing has to be re-parsed or re-checked.

## Reusing and composing schemas

A reusable unit is a **plain schema value**. There is no definer, no set, no
group, and no name to register - a Standard Schema already travels as an
export, and it carries no source keys to misspell.

```ts
// server/validation/listing.ts
import * as v from 'valibot'
import { z } from 'zod'

export const pagination = z.object({
  page: z.coerce.number(),
  size: z.coerce.number(),
})

export const sorting = v.object({ sort: v.picklist(['asc', 'desc']) })
```

Give a source a tuple to compose several schemas onto it:

```ts
// server/api/users/index.get.ts
import { pagination, sorting } from '~~/server/validation/listing'
import { profileBody } from '~~/server/validation/profile'

export default defineValidatedEventHandler(
  { input: { query: [pagination, sorting], body: profileBody } },
  async (event, { query, body }) => {
    // query: { page: number, size: number, sort: 'asc' | 'desc' }
    return listUsers(query, body)
  }
)
```

- **Every element parses the whole raw source, in order**, and you receive the
  merge of their outputs. The wire is untouched - the client still sends a flat
  `?page=1&size=20&sort=asc`, and an issue's `path` stays relative to that raw
  source.
- **The merged type is one flat record**, not a chain of `&`. It reads on hover
  the way the runtime value looks, and it is spellable as a declared return
  type.
- **Issues aggregate within a source.** An early element's failure does not
  stop the later ones, so reordering a tuple never changes what a client sees.
  Elements run sequentially, so async schemas are deterministic.
- **A tuple, not an array.** A widened `StandardSchemaV1[]` cannot say how many
  schemas it holds, so its merge could not be typed. Write the array literal
  inline, or add `as const`.
- **A lone schema and a one-element tuple are identical.** `x` and `[x]`
  deliver the same value, and neither has anything to merge - so a lone
  schema's output may be anything, primitives and unions included.
- **A set spanning several sources is just an object of schema values.** Export
  `{ headers, query }` from one file and let each route say which slot each
  schema fills.

### Two rules for composed sources

Composing two or more schemas onto one source has exactly two compile-time
rules, both reported **at the offending source key, at the declaration**:

1. **Every composed output must be an object** - not a primitive, an array or a
   function. The test is structural, so an interface-typed output (a
   `z.custom<ThirdParty>()`, a hand-written schema) is not falsely refused.
2. **Their output keys must be pairwise disjoint.** An intersection would lie
   about which value survives, so an overlap is refused. Merge at the schema
   library level instead (`.extend`, `v.intersect`, …) or rename the key.
   Composing the _same_ schema twice counts as an overlap.

A composed value satisfies each part structurally - `helper(query)` typed off
`pagination` alone still typechecks - but the other elements' keys ride along.
The promise is "existing keys do not change", not "the shape does not change".

## What each source receives

Sources are handed to your schemas exactly as h3 yields them. Nothing is
normalized or coerced on the way, because every conversion belongs in the
schema where the rest of your parsing rules live.

- **Order is guaranteed and fail-fast:
  `route -> query -> headers -> body`.** Cheap-and-sync first,
  stream-consuming last, so an invalid route param spares the body parse. There
  is no aggregate mode. Multiple issues _within_ one source still arrive
  together, so a form with two bad fields needs one round trip.
- **Query** values are `string | string[]`; duplicate keys become arrays. All
  coercion belongs in your schema (`z.coerce.number()` and friends).
- **Headers** have lowercase keys, with multi-values joined by `", "`. No
  case-insensitivity or splitting magic is added.
- **Route params** arrive URL-decoded. A catch-all is one slash-joined decoded
  string, under key `_` for an anonymous `[...].ts`.
- **A method that cannot carry a body validates `undefined`.** Outside h3's
  payload methods (`PATCH`, `POST`, `PUT`, `DELETE`) the body read is skipped
  entirely, so a method-agnostic route file that declares a body keeps working
  for `GET` instead of answering h3's bare `405`.
- **An empty body validates `undefined`** too. Express "optional body" in the
  schema, where all other optionality lives.
- **A body the request made unreadable fails like any other bad input**: any
  `4xx` from the body read becomes exactly one issue,
  `{ "source": "body", "message": "Request body could not be parsed", "path": [] }`.
  The message never echoes body content. `5xx` and non-HTTP throws - a dropped
  connection, a stream error - propagate untouched rather than being dressed up
  as validation issues.

The body is read through h3's own validated-body door
(`readBody(event, { strict: true })`), so today
`application/x-www-form-urlencoded` arrives as an object of `string | string[]`
(HTML form posts validate for free), `text/*` arrives as the raw string, and
everything else parses strictly as JSON. **That branching is h3's, described
here rather than promised** - h3 v2 keeps none of it.

## Response output

`output` declares what a route answers with when it succeeds. It is optional
and independent of `input`: declare both, or either one alone.

### The bare form: one `200`

```ts
// server/api/users/[id].get.ts
import { z } from 'zod'

const user = z.object({ id: z.number(), name: z.string() })

export default defineValidatedEventHandler(
  {
    input: { route: z.object({ id: z.coerce.number() }) },
    output: user,
  },
  async (event, { route }) => findUser(route.id)
)
```

A bare schema is shorthand for a single `200`. The handler returns the value
plainly, constrained to the schema's **output** type - the side the wire sees,
so a transform is already applied where the type is concerned. No helper is
offered on this form.

### The map form: one status per reply

```ts
// server/api/users.post.ts
const existing = z.object({ id: z.string() })
const created = z.object({ id: z.string(), createdAt: z.string() })

export default defineValidatedEventHandler(
  {
    input: { body: z.object({ email: z.email() }) },
    output: { 200: existing, 201: created },
  },
  async (event, { body, respond }) => {
    const found = await findByEmail(body.email)

    if (found) return respond(200, { id: found.id })

    const user = await create(body)

    return respond(201, { id: user.id, createdAt: user.createdAt })
  }
)
```

A status map puts `respond` in the second parameter, and a map-form route
answers through it and nothing else. It pairs **status and value, checked
together**: `status` is the union of the declared statuses, and the value is
that status's output type.

```ts
respond(404, { id: '1' }) // 404 is not one of `200 | 201`
respond(201, { id: '1' }) // the 201 body is missing `createdAt`
return { id: '1' } // a bare value names no status
```

All three are compile errors, at the line that wrote them. **One key is still a
map**: `output: { 201: created }` has no plain-return shortcut, because the
status is the thing being declared.

The helper sets the status and sends the value; nothing else about the response
is touched, so `setResponseHeader` and friends work as they always did.

### `null`: a status with no body

```ts
export default defineValidatedEventHandler(
  { output: { 202: queued, 204: null } },
  async (event, { respond }) => {
    const job = await enqueue()

    return job === undefined ? respond(204) : respond(202, { job })
  }
)
```

Any status may map to `null`. `respond(204)` takes no second argument, and
`respond(204, value)` is `Expected 1 arguments, but got 2`. On the wire the
status is what the helper named, with no body.

### What the client sees

Fetch still infers the response from the handler's return, exactly as it does
without `output`: the schema's output type for the bare form, and the **union
of the mapped bodies** for the map form. The status the handler chose is not
part of that type; read it from `$fetch.raw` where it matters.

### `output` alone is a declaration

A route may declare `output` and nothing else:

```ts
export default defineValidatedEventHandler({ output: user }, () => loadUser())
```

`output` is not a Validation source, so such a route has no source keys in its
second parameter, no `400` of this package's to answer with, and an empty
Request input. Declaring neither half is refused - see [Compile errors this
package writes itself](#compile-errors-this-package-writes-itself).

### The development-only response check

On a development server the wrapper additionally runs the declared schema
against the value the handler handed over - the plain return on the bare form,
the value inside `respond(status, value)` on the map form - and awaits it. A
status declared `null` has no schema and nothing to check.

A value the schema rejects is a plain `500` naming the route, the status and
every issue:

```text
[nuxt-handler-validation] cannot send the response: GET /api/users/1 answered 200 with a value its declared Response output rejects - id: Invalid input: expected string, received number. Nothing checks the response in production, so this route would send that value as it is: fix the handler or the schema, or set `checkResponses: false`.
```

- **It is an assertion, never a transform.** The result is discarded, so a
  development server sends the bytes production sends. An `output` schema that
  would strip an extra key or coerce a value does neither on the way out -
  declare a schema that _describes_ the value, not one that would repair it.
- **Nothing runs in production.** The check is gated on `import.meta.dev`, a
  build-time constant, so a production build never runs a schema on a response
  at all - which is exactly why the development server is worth having check.
- **It is on by default**, and `handlerValidation: { checkResponses: false }`
  turns it off for an app whose responses a schema cannot describe.
- **The `500` is unmarked.** It carries no validation marker, so
  `recognizeValidationError` answers `undefined` for it and an observability
  hook that skips validation failures still reports it.

## When validation fails: the wire shape

A failing request answers `400` with one fixed shape - **no options, and
identical in development and production**:

```jsonc
{
  "statusCode": 400,
  "statusMessage": "Validation Error",
  "message": "...", // a short human summary; nothing may parse it
  "data": {
    "issues": [
      { "source": "query", "message": "Expected number", "path": ["page"] },
    ],
  },
}
```

- **Status is `400`, not configurable.** A fixed status is what makes the shape
  stable and documentable.
- **Every issue is projected to `{ source, message, path }` - nothing else.**
  Raw Standard Schema issues are not JSON-safe and can carry the request's own
  input, so the projection is built by construction rather than by filtering:
  vendor extras are dropped and `path` normalizes to `Array<string | number>`.
  The projection **is** the sanitization, which is why there is no redaction
  option and no production branch.
- **`source` is one of `route`, `query`, `headers` and `body`**, and every
  issue in one failure carries the same one, because validation is fail-fast.
  The human summary reads `Validation failed for <source>` - so a rejected
  route param answers `"source": "route"` under
  `"message": "Validation failed for route"`.
- Those four keys are this package's. The envelope around them is Nitro's - it
  adds `url`, and a `stack` in development.

### Rendering issues on the client

`ValidationIssue` and `ValidationErrorData` come from
`@dphonys/nuxt-handler-validation/types`, which is type-only and safe to import
from components.

```vue
<script setup lang="ts">
import type { ValidationErrorData } from '@dphonys/nuxt-handler-validation/types'
import type { FetchError } from 'ofetch'

const fieldErrors = ref<Record<string, string>>({})

async function submit(body: unknown) {
  fieldErrors.value = {}

  try {
    await $fetch('/api/users', { method: 'POST', body })
  } catch (error) {
    const failure = error as FetchError<{ data?: ValidationErrorData }>

    for (const issue of failure.data?.data?.issues ?? []) {
      fieldErrors.value[issue.path.join('.')] = issue.message
    }
  }
}
</script>
```

**Note the double `data`.** `FetchError.data` is the whole error body, and this
package's payload is that body's `data` - so issues sit at
`err.data.data.issues`, and there is nothing at `err.data.issues`. Both `data`s
are the framework's.

## Observability

`recognizeValidationError` answers the issues a validation failure raised, or
`undefined` for "not a validation failure". It reads a symbol marker on the
error and nothing else - never `data`, never `cause` at any depth - and the
marker never reaches the wire.

```ts
// server/plugins/observability.ts
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error) => {
    // A request that failed validation: expected, not a bug.
    if (recognizeValidationError(error)) return

    report(error)
  })
})
```

The same predicate works in Sentry's `beforeSend` over
`hint.originalException`. It returns a value rather than being a type
predicate, so it pairs with the sibling package's `recognizeKnownError` in one
hook.

**Only a `400` validation failure is marked** - including the body read this
package absorbs into a single `body` issue. Every developer mistake the package
raises carries no marker, so the recipe above still reports all of them.

**What a marked error tells you, exactly:** it was raised by this package **in
this process**, and never arrived over a fetch. It is _not_ necessarily this
route's own declaration failing - an `H3Error` propagates in-process by
identity, so a directly called handler or shared function running the wrapper's
validation delivers an indistinguishable marked error. It also does not
guarantee the request answered `400`: an SWR revalidation fires the hook while
the response was served `200` from cache. Nitro types the hook's event argument
as optional, so write the hook against the error itself.

## Troubleshooting

### `satisfies`, never `: ValidationSchemas`

This is the one footgun worth memorizing. Annotating a declaration compiles,
but delivers no readable sources:

```ts
// Wrong: `validated.query` is a compile error, even though query is declared.
const schemas: ValidationSchemas = { query: pagination }

// Right: the inferred literal is what the second parameter is computed from.
const schemas = { query: pagination } satisfies ValidationSchemas
```

The annotation throws away the very value the inference needed. The second
parameter is mapped over the declaration's **inferred** keys, and annotating
replaces the literal's one known key with the interface's four optional ones -
so nothing is guaranteed and nothing is delivered. Leave the literal inline, or
use `satisfies`.

### Compile errors this package writes itself

A typo'd or stray key is rejected **even when it sits beside valid ones** -
`{ query: q, boyd: schema }` is a compile error, not a body that silently never
validates. The wrapper has one signature, so no rejection collapses into a
`TS2769: No overload matches this call` paragraph; every diagnostic lands at the
key that caused it. Four sentences are the whole surface:

```text
every schema composed on one source must produce an object output - not a primitive, an array or a function
schemas composed on one source must produce disjoint output keys - merge them in your schema library instead
'boyd' is not a validation source - the sources are route, query, headers and body
declare input, output, or both
```

The fourth is the guard against a declaration that declares nothing: it arrives
as an unsatisfiable `__declareSomething__` property on a bare `{}`, and on an
`output: {}`, which names no status the handler could ever answer under and is
therefore no more a declaration than no key at all.

A value that is not a schema is rejected at the offending property, and reading
an undeclared source in the handler reports as
`Property 'body' does not exist on type 'ValidatedContext<…>'`.

**A misanswered `output` is the compiler's own sentence**, not one of this
package's: the declaration types the call, so TypeScript already says what
went wrong.

| what you wrote                                               | what you are told                                                            |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `respond(404, …)` on `output: { 200: …, 201: … }`            | `Argument of type '404' is not assignable to parameter of type '200 \| 201'` |
| `respond(201, { id })` where `201` also promised `createdAt` | `Property 'createdAt' is missing in type '{ id: string; }'`                  |
| a plain return on a map form, a one-key map included         | not assignable to `EventHandlerResponse<Responded<…>>`                       |
| `respond(204, value)` where `204` maps to `null`             | `Expected 1 arguments, but got 2`                                            |
| `respond` on a bare-form route, which is never offered it    | `Property 'respond' does not exist on type 'ValidatedContext<…>'`            |
| a plain return that is not the bare form's output type       | not assignable to `EventHandlerResponse<…>`                                  |

### Runtime errors for what the types cannot see

For plain-JS callers, `any`-typed schemas, and runtime values no type can
predict, the runtime mirrors the same rules. **None of these is marked**, so
`recognizeValidationError` returns `undefined` and your observability hook
still reports every one.

**At route evaluation**, before any request is served, a plain `Error`: a source
slot holding something that is not a Standard Schema, naming the source and the
element index. The route never becomes servable - which is what keeps a `null`
in a slot from becoming an unattributed
`TypeError: Cannot read properties of null (reading '~standard')` on every
request.

Two more plain `Error`s fire there, each a compile guard's answer for a caller
the types never saw: a declaration that declares **neither** half
(`defineValidatedEventHandler must declare input, output, or both`), and an
`output` that **names no reply** the handler could send - an empty status map,
or a value that is neither a Standard Schema nor a status map.

**Per request**, as a plain unmarked `500` naming the source:

| what happened                                                             | detected                                     |
| ------------------------------------------------------------------------- | -------------------------------------------- |
| an element output that is not a plain object at merge time                | after the tuple ran; names the element index |
| an element that reported neither a value nor any issue (`{ issues: [] }`) | after the tuple ran; names the element index |
| a source declared with an empty tuple, so nothing validated it            | at merge time                                |

These are latent by nature - such a route serves `200`s until a request reaches
the case, and what a schema answers is unknowable without running it. The rule
behind all three: **a declared source must be delivered as something every
element actually contributed to.**

The Response output has one of its own: a route declaring a status map whose
handler hands back anything but the Respond helper's result answers an unmarked
`500` naming what it returned instead. The compiler refuses that return, so
only a JavaScript caller reaches it.

### Edges the compile-time guard does not catch

- **Overlap between outputs carrying an index signature is allowed.**
  `z.looseObject`, `z.record` and any passthrough output widen `keyof` to
  `string`, so the guard cannot compare them against a sibling's without
  refusing every merge they appear in. Colliding keys are decided by the
  runtime's later-wins spread, in tuple order.
- **An `any`-typed element is accepted, and takes the whole slot with it.** The
  slot's delivered type becomes `any` - the honest report, since an element that
  promises nothing cannot be merged into a promise.
- **Exotic object outputs pass the compile gate.** A `Date`, a `Map` or any
  class instance _is_ structurally an object, so the declaration is accepted;
  the runtime merge refuses it with the `500` above, because its meaning lives
  outside its own enumerable keys.
- **A malformed `input` object itself is an untyped `TypeError`.** The guard
  covers what is _inside_ `input`, not a `null` in the object's place.
- **A status map's keys are not checked against HTTP.** The map is keyed by
  `number`, so `output: { 999: schema }` declares the status `999` as happily
  as it declares `200`; only the statuses you wrote are answerable.

## Turning the module off

`handlerValidation: false` disables the module - a real off-switch for the day
an auto-import collision needs isolating. Short of that, `handlerValidation` is
a bag with exactly one key, `checkResponses`; a stray key such as
`handlerValidation: { channelToken: 'x' }` is still a compile error.

## API reference

Runtime, from `@dphonys/nuxt-handler-validation/server`, both auto-imported
inside `server/`:

| Export                                               | Role                                                                                                                       |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `defineValidatedEventHandler({ input, output }, fn)` | The wrapper. One signature, at least one of the two keys. Returns a `ValidatedEventHandler`, an h3 `EventHandler` subtype. |
| `recognizeValidationError(error)`                    | Observability predicate, process-side only. Returns `ValidationErrorData \| undefined`.                                    |

Types, from `@dphonys/nuxt-handler-validation/types` - type-only, safe to
import from app code: `ValidationSchemas`, `SourceSchemas`, `ValidationSource`,
`ValidatedContext<S, O>`, `ValidatedHandlerOptions<S, O>`, `SourceValue<T>`,
`MergedOutput<T>`, `OutputOf<S>`, `ValidationIssue`, `ValidationErrorData`, and
the two families below:

| Type                              | Role                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `InputOf<S>`                      | A schema's input - what the client sends, before transforms.                                                                   |
| `MergedInput<T>`                  | A composed tuple's input: the intersection of its element inputs, flattened to one record.                                     |
| `SourceInput<T>`                  | One slot's input - a lone schema's input, or the tuple's intersection.                                                         |
| `RequestInput<S>`                 | The request input: keys are the declared sources, values what the client sends for each.                                       |
| `ValidatedEventHandler`           | What `defineValidatedEventHandler` returns: an h3 `EventHandler` carrying its Request input and its Response output as brands. |
| `RequestInputOfHandler<T>`        | Reads that brand off a handler type; `never` for `any` and for handlers this package did not produce.                          |
| `ValidationSchemasGuard<S>`       | The compile-time guard behind the declaration diagnostics above.                                                               |
| `ValidationDeclarationError<Msg>` | The sentence-shaped type those diagnostics surface.                                                                            |
| `DeclareSomething<S, O, Msg>`     | The "declare something" guard; its sentence is a parameter, so the umbrella composes it with its own.                          |

The response-output family:

| Type                         | Role                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| `ResponseOutput`             | What `output` accepts: one schema, or a `StatusMap`.                                              |
| `StatusMap`                  | The map form - `{ readonly [status: number]: StandardSchemaV1 \| null }`.                         |
| `ResponseOutputs<O>`         | The declaration as a map of status to _output_ type; the bare form reads `{ 200: … }`.            |
| `ResponseBodies<O>`          | Every body the declaration can send, as one union - what a client sees.                           |
| `HandlerReturn<O>`           | What the handler must hand back: the bare form's output type, or `Responded<…>` for the map form. |
| `SentResponse<O, Response>`  | What the wrapper's product reports as its h3 `Response`.                                          |
| `Respond<Outputs>`           | The Respond helper's signature, as the map-form second parameter carries it.                      |
| `Responded<Outputs>`         | Its opaque result. Only `respond` can make one, which is what refuses a hand-written envelope.    |
| `ResponseOutputOfHandler<T>` | Reads the Response-output brand off a handler type; `never` for `any` and for foreign handlers.   |

And from `@dphonys/nuxt-handler-validation` itself, `ModuleOptions` -
`{ checkResponses: boolean }`.

**On the name.** `defineValidatedEventHandler` mirrors the _current_ vanilla
`defineEventHandler`, so its role is obvious on sight. It is deliberately not
h3 v2's `defineValidatedHandler` - taking that name now would squat on the one
h3 will auto-import the day Nuxt ships it. Expect a rename at that alignment
point.

## Repository development

From the repository root:

```sh
pnpm --filter @dphonys/nuxt-handler-validation dev
pnpm --filter @dphonys/nuxt-handler-validation typecheck
pnpm --filter @dphonys/nuxt-handler-validation test
pnpm --filter @dphonys/nuxt-handler-validation build
pnpm --filter @dphonys/nuxt-handler-validation publint
```

The `internals/*` entries, consumed only by `@dphonys/nuxt-typed-handler`, are
documented in [`INTERNALS.md`](./INTERNALS.md).

## License

Licensed under the [MIT License](./LICENSE).
