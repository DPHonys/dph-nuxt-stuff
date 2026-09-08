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

That is the only setup step - the module has **zero options**. Nothing about a
route's validation is configured; it is declared, in the route.

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
      routerParams: v.object({ id: v.pipe(v.string(), v.transform(Number)) }),
      query: z.object({ page: z.coerce.number() }),
      body: z.object({
        name: z.string(),
        tags: z.string().transform((s) => s.split(',')),
      }),
    },
  },
  async (event, { routerParams, query, body }) => {
    // routerParams: { id: number }
    // query:        { page: number }
    // body:         { name: string, tags: string[] }
    return updateUser(routerParams.id, body)
  }
)
```

- **Schemas nest under `input`**, keyed by source. The four sources are
  `routerParams`, `query`, `headers` and `body`.
- **Validated values arrive eagerly and fully typed in the second parameter**,
  each typed as its schema's _output_ - so coercions and transforms land in the
  handler already applied. Undeclared sources are **absent** from that
  parameter, not `unknown` and not optional; reading one is a compile error
  naming the key.
- **Mix libraries freely.** zod and valibot can sit in one declaration, or even
  in one composed tuple. Async schemas are supported; the wrapper awaits them.
- **Your return type flows to Nitro's typed routes unchanged.** The wrapper
  returns a `ValidatedEventHandler` - still assignable to h3's `EventHandler`,
  carrying the `RequestInput` brand - so `$fetch('/api/users/1')` infers the
  response exactly as it would with `defineEventHandler`. Nothing to unwrap.
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
  `routerParams -> query -> headers -> body`.** Cheap-and-sync first,
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
key that caused it. Three sentences are the whole surface:

```text
every schema composed on one source must produce an object output - not a primitive, an array or a function
schemas composed on one source must produce disjoint output keys - merge them in your schema library instead
'boyd' is not a validation source - the sources are routerParams, query, headers and body
```

A value that is not a schema is rejected at the offending property, and reading
an undeclared source in the handler reports as
`Property 'body' does not exist on type 'ValidatedContext<…>'`.

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

## Turning the module off

`handlerValidation: false` disables the module - a real off-switch for the day
an auto-import collision needs isolating. It is not an options bag: a stray key
such as `handlerValidation: { channelToken: 'x' }` is a compile error.

## API reference

Runtime, from `@dphonys/nuxt-handler-validation/server`, both auto-imported
inside `server/`:

| Export                                       | Role                                                                                         |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `defineValidatedEventHandler({ input }, fn)` | The wrapper. One signature. Returns a `ValidatedEventHandler`, an h3 `EventHandler` subtype. |
| `recognizeValidationError(error)`            | Observability predicate, process-side only. Returns `ValidationErrorData \| undefined`.      |

Types, from `@dphonys/nuxt-handler-validation/types` - type-only, safe to
import from app code: `ValidationSchemas`, `SourceSchemas`, `ValidationSource`,
`ValidatedContext<S>`, `SourceValue<T>`, `MergedOutput<T>`, `OutputOf<S>`,
`ValidationIssue`, `ValidationErrorData`, and the request-input family:

| Type                              | Role                                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `InputOf<S>`                      | A schema's input - what the client sends, before transforms.                                             |
| `MergedInput<T>`                  | A composed tuple's input: the intersection of its element inputs, flattened to one record.               |
| `SourceInput<T>`                  | One slot's input - a lone schema's input, or the tuple's intersection.                                   |
| `RequestInput<S>`                 | The request input: keys are the declared sources, values what the client sends for each.                 |
| `ValidatedEventHandler`           | What `defineValidatedEventHandler` returns: an h3 `EventHandler` carrying its `RequestInput` as a brand. |
| `RequestInputOfHandler<T>`        | Reads that brand off a handler type; `never` for `any` and for handlers this package did not produce.    |
| `ValidationSchemasGuard<S>`       | The compile-time guard behind the declaration diagnostics above.                                         |
| `ValidationDeclarationError<Msg>` | The sentence-shaped type those diagnostics surface.                                                      |

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
