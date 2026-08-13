# Nuxt Handler Validation

Declare a Nitro handler's request schemas once, and get the validated,
fully-typed values in the handler's second parameter - query, body, route
params and headers, validated via any [Standard Schema](https://standardschema.dev)
library _before_ the handler body runs. Failures answer with one stable,
documented wire shape, identical in dev and prod.

## Installation

```sh
pnpm add @dphonys/nuxt-handler-validation
```

```ts
export default defineNuxtConfig({
  modules: ['@dphonys/nuxt-handler-validation'],
})
```

The module has **zero options** - nothing about a route's validation is
configured, it is declared, in the route. Installing it is the only setup step.

The `handlerValidation` config key is not an empty formality, though. Nuxt
generates a typed entry for every module that names a config key, so
**`handlerValidation: false` disables the module** - a real off-switch for a
module whose whole job is auto-import wiring, for the day an auto-import
collision needs isolating. An off-switch is not an option: a stray key such as
`handlerValidation: { channelToken: 'x' }` is a compile error.

## Declaring what a handler validates

```ts
// server/api/users/[id].post.ts
import * as v from 'valibot'
import { z } from 'zod'

export default defineValidatedEventHandler(
  {
    routerParams: v.object({ id: v.pipe(v.string(), v.transform(Number)) }),
    query: z.object({ page: z.coerce.number() }),
    body: z.object({
      name: z.string(),
      tags: z.string().transform((s) => s.split(',')),
    }),
  },
  async (event, { routerParams, query, body }) => {
    // routerParams: { id: number }
    // query:        { page: number }
    // body:         { name: string, tags: string[] }
    return updateUser(routerParams.id, body)
  }
)
```

- **The options argument is flat**: schemas are top-level keys. The four
  sources are `routerParams`, `query`, `headers` and `body` - h3's own
  vocabulary. The one alternative to this flat object is an **array of
  fragments**, which is how reusable sets compose - see
  [Reusing schema sets](#reusing-schema-sets-definevalidation).
- **Validated values arrive eagerly, fully typed, in the second parameter** -
  each source typed as its schema's _output_ type, so coercions and transforms
  land in the handler already applied. Undeclared sources are **absent** from
  that parameter - not `unknown`, not optional; reading one is a compile error.
- **Any Standard Schema works, mixed freely** - zod, valibot, anything with
  `~standard`, in any combination within one call. The contract is only the
  interface. **Async schemas are supported**; the wrapper awaits.
- The handler's **return type flows to Nitro's typed routes** unchanged: the
  wrapper returns a plain h3 `EventHandler`, so `$fetch` call sites infer the
  response exactly as with `defineEventHandler`.
- Everything above is auto-imported inside `server/`, the same ambient position
  as `defineEventHandler`. The explicit door is
  `@dphonys/nuxt-handler-validation/server` - the form that works where
  auto-imports do not reach: Nitro plugins and tasks, tests, non-Nuxt Nitro
  consumers, `imports.autoImport: false`. That entry carries the runtime and
  depends on h3, so nothing reaching the client may import it;
  `@dphonys/nuxt-handler-validation/types` is the type-only door for app code.

### The second parameter is the validated door

The values in the second parameter are the validated ones, and they are the
only door to them. Each source is read **once** per request, before the handler
body runs; calling `readBody(event)` afterwards hands back h3's memoized
_unvalidated_ parse, not what the schema produced. Read what you declared from
the second parameter and nothing has to be re-parsed or re-checked.

### Only the four source keys, and misuse stays humane

A typo'd or stray key is rejected **even when it sits beside valid ones** -
`{ query: q, boyd: schema }` is a compile error, not a body that silently never
validates.

- A near-miss gets the compiler's own hint: `Did you mean to write 'query'?`.
- Because the wrapper is overloaded, a rejected declaration reports through it
  as `TS2769: No overload matches this call`; the actionable sentence, hint
  included, survives inside the paragraph for the form you wrote. A misuse at a
  `defineValidation` call reports at the offending key instead - an
  arity-overloaded definer has nothing to collapse.
- A value that is not a schema is rejected at the offending property.
- Reading an undeclared source in the handler names the missing key, and
  reading one that a composition collision poisoned prints the collision's own
  sentence verbatim.

The name `defineValidatedEventHandler` mirrors the _current_ vanilla
`defineEventHandler`, so its role is obvious on sight.

## Reusing schema sets: `defineValidation`

```ts
// server/validation/listing.ts - the values travel, no registry exists.
import { z } from 'zod'

export const pagination = defineValidation('pagination', {
  query: z.object({ page: z.coerce.number(), size: z.coerce.number() }),
})

export const sorting = defineValidation({
  query: z.object({ sort: z.enum(['asc', 'desc']) }),
})
```

```ts
// server/api/users/index.get.ts
import { pagination, sorting } from '~~/server/validation/listing'
import { profileBody } from '~~/server/validation/profile'

export default defineValidatedEventHandler(
  [...pagination, ...sorting, { body: profileBody }],
  async (event, { query, body }) => {
    // query.pagination: { page: number, size: number } - the set's exact output
    // query.sort:       'asc' | 'desc' - the unnamed set's, flat
    return listUsers(query.pagination, query.sort, body)
  }
)
```

- `defineValidation` returns a **group** - a readonly one-element tuple holding
  the schema set - and **groups compose by array spread**:
  `[...pagination, ...sorting, { body: x }]`. Spread appends, so composing sets
  composes their validations: two sets declaring the same source both run.
  Inline fragments mix freely with spread groups, and a single group passes
  without spread: `defineValidatedEventHandler(pagination, ...)`.
- **Three words, two things.** A **set** is one `defineValidation` call's
  schemas - the unit of reuse, and one **fragment** of a handler's declaration;
  an inline `{ body: x }` is a fragment that was never a set. A **group** is the
  readonly tuple `defineValidation` hands back. You compose fragments, and you
  spread groups to get at them.
- **A named set nests its output under its name** - `query.pagination.page` -
  uniformly, alone or composed, collision or not, so a route's shape does not
  change when another set joins. `query.pagination` is _exactly_ the pagination
  schema's output: pass it whole to a helper typed off the same schema, with no
  other set's keys riding along. The name namespaces **every** source the set
  declares (`defineValidation('auth', { headers, query })` gives `headers.auth`
  and `query.auth`).
- **An unnamed set stays flat in the source** - its output keys land directly,
  as an inline fragment's do. Colliding unnamed outputs merge, typed as the
  intersection, under two compile-time rules: every colliding output must be a
  plain object, and colliding unnamed fragments must have **disjoint output
  keys**. The escape from an overlap _is_ a name.
- **Namespacing is output-only.** Every schema parses the whole raw source - the
  client still sends a flat `?page=1&sort=asc` - and nesting happens after
  validation, so the wire shape is untouched by it. An issue's `path` is always
  relative to the raw source and never names the set that rejected it:
  `["page"]`, never `["pagination", "page"]`.

### Inline literals are fine; anything exported and reused goes through the definer

Soundness is identical either way - the source-key guard applies to a plain
exported object exactly as it does through `defineValidation`. What differs is
**where a mistake prints**, and that is the whole reason for the rule: through
`defineValidation`, a typo reports **once, at the offending key, in the file
that is wrong**; as an exported plain object, that file compiles clean and the
error surfaces at _every_ consuming route instead, as a whole-declaration
mismatch far from the character that caused it.

Two costs, stated: `[...defineValidation({ ... })]` is more ceremony than an
inline literal for a set used once, and a set defined outside `server/` pays an
explicit `@dphonys/nuxt-handler-validation/server` import that a plain object
does not.

### Collisions

Five collisions are compile errors, each a poison that fails on first property
access and prints its own sentence: two **different** sets sharing a name on one
source, a set name colliding with an unnamed fragment's output key, colliding
unnamed non-object outputs, a non-object unnamed output beside a named set, and
overlapping unnamed output keys.

For the shapes types cannot see - plain JS, a widened array, an `any`-typed
schema - the runtime errors only where no total rule can be written, and follows
a documented rule everywhere else:

| collision                                | runtime                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| two different sets, one name, one source | throws when the route file is evaluated                                   |
| outputs that cannot merge                | `500` at merge time, naming the source, the fragment and what it produced |
| set name vs unnamed output key           | named wins                                                                |
| overlapping unnamed output keys          | later-wins, in array order                                                |

Spreading the same set twice is not a collision: nothing is lost, so nothing
throws.

**Do not object-spread groups.** `{ ...pagination, ...sorting }` keeps only the
last fragment at runtime while its type claims both. It is a compile error, and
the wrapper also throws a teaching error naming the fix (`[...a, ...b]`) when
the route file is evaluated, before any request is served - for the callers the
types never see. This is also why `defineValidation` returns a tuple rather than
a bare schema set: two bare sets object-spread together would produce a _valid_
flat declaration and lose a source in silence.

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

Those four keys are this package's, and they are what does not vary by
environment. The envelope around them is Nitro's: it adds its own keys to an
error body (`url`, and in development a `stack`), and those are the framework's
to change.

- **Status is `400`, not configurable.** A fixed status is what makes the shape
  stable and documentable.
- **Every issue is projected to `{ source, message, path }` - nothing else.**
  Raw Standard Schema issues are not JSON-safe and can carry the request's own
  input, so the projection is by construction rather than by filtering: vendor
  extras are dropped and `path` normalizes to `Array<string | number>`. **The
  projection is the sanitization** - which is why there is no redaction option
  and no production branch.
- **`source` is tagged per issue.** Validation is fail-fast across sources, so
  every issue in one response carries the same one; the tag is per-issue so the
  array shape survives future aggregation.
- **The shape is nameable from app code.** `ValidationIssue` and
  `ValidationErrorData` live in `@dphonys/nuxt-handler-validation/types`, which
  is type-only - a component rendering field errors off a caught `NuxtError`
  types the payload without pulling server code into the client bundle.
- **A fetched failure's issues sit at `err.data.data.issues`.** `FetchError.data`
  is the whole error body, and this package's payload is that body's `data`;
  there is nothing at `err.data.issues`. Both `data`s are the framework's, and
  the depth is the same asymmetry the sibling package documents.

## What each source receives

- **Sources validate fail-fast, in a guaranteed order:
  `routerParams -> query -> headers -> body`.** Cheap-and-sync first,
  stream-consuming last, so an invalid earlier source spares the body parse.
  There is no aggregate mode and no option. Multiple issues _within_ one
  source - across its fragments as well as within one schema - still arrive
  together.
- **Query is passed as h3 yields it**: values are `string | string[]`, and
  duplicate keys become arrays. All coercion belongs in your schema
  (`z.coerce.number()` and friends).
- **Headers are passed as h3 delivers them**: lowercase keys, multi-values
  joined with `", "`. No case-insensitivity or splitting magic.
- **Route params are URL-decoded**; a catch-all arrives as one slash-joined
  decoded string (key `_` for an anonymous `[...].ts`).
- **A method that cannot carry a body validates `undefined`.** If the request's
  method is outside h3's payload methods (`PATCH | POST | PUT | DELETE`) the
  body read is skipped - not attempted and caught - so a method-agnostic route
  file that declares a body keeps working for `GET` instead of answering h3's
  bare `405`.
- **An empty body validates `undefined`** too. No special-casing: "optional
  body" is expressed in the schema, where all other optionality lives.
- **A body the request made unreadable fails the same way as any other bad
  input**: any `4xx` thrown by the body read becomes exactly one issue,
  `{ "source": "body", "message": "Request body could not be parsed", "path": [] }`.
  The message is this package's own and content-type-agnostic; it never echoes
  body content. `5xx` and non-HTTP throws - a dropped connection, a stream
  error - propagate untouched rather than being dressed up as validation issues.

### What the body schema actually receives

The body is read through h3's own validated-body door
(`readBody(event, { strict: true })`), so what the schema receives is h3's
parse. **The list below describes what current h3 does; it is not a promise this
package makes:**

- `application/x-www-form-urlencoded` arrives as an object of
  `string | string[]`, so HTML form posts validate for free.
- `text/*` arrives as the **raw string**, for the schema to accept or reject.
- Everything else - `application/json`, an absent content type,
  `application/octet-stream`, `multipart/form-data` - is parsed strictly as
  JSON.

h3 v2 keeps none of that branching, so pinning it here would turn a future
alignment into a re-implementation of today's behaviour. What _is_ promised: the
fail-fast order, the `400` + `data.issues` shape, that an unparseable body
produces exactly one `source: "body"` issue, and that a method which cannot
carry a body validates `undefined`.

## Observability: `recognizeValidationError`

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
`hint.originalException`. It is a value, not a type predicate, so it pairs with
the sibling package's `recognizeKnownError` in one hook.

**What a marked error tells you, exactly.** It was raised by this package **in
this process**, and never arrived over a fetch. It is _not_ necessarily this
route's own declaration failing: an `H3Error` propagates in-process by identity,
so a directly called handler, a `defineEventHandler` middleware or any shared
function running the wrapper's validation delivers a marked error
indistinguishable from this route's own throw. Two cases where the request did
not even answer `400`: an SWR revalidation, where the hook fires while the
response was served `200` from cache, and a plugin or `unhandledRejection`
capture. Nitro types the hook's second argument with an **optional** event, so
write the hook against the error itself rather than assuming a request is there.

**Only a `400` validation failure is marked** - including the body read this
package absorbs into a single `body` issue. Every developer mistake it raises
carries none: a `validate` that throws, the declaration-time guards, and the
`500` for outputs that cannot merge. A marker meaning "raised by this package"
would let a well-meaning `if (recognizeValidationError(error)) return` swallow
exactly the bugs that must keep reporting.

There is deliberately **no `unhandled === false` half** here, unlike the
sibling's recipe: this marker is a non-serialized symbol rather than a field
inside `data`, so the case that check discriminates cannot arise.

## The public surface

Runtime, from `@dphonys/nuxt-handler-validation/server`, all three auto-imported
inside `server/`:

| Export                                                          | Role                                                                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `defineValidatedEventHandler(schemas \| fragments, handler)`    | The wrapper. A flat schema object or an array of composed fragments.                                                      |
| `defineValidation(schemas)` / `defineValidation(name, schemas)` | Definer for reusable schema sets; returns a group composed by array spread. The named form nests its output under `name`. |
| `recognizeValidationError(error)`                               | Observability predicate, process-side only. Returns `ValidationErrorData \| undefined`.                                   |

Types, from `@dphonys/nuxt-handler-validation/types` - type-only, safe to import
from app code: `ValidateSchemas`, `ValidationFragment`, `ValidationGroup<F>`,
`ValidatedContext<S>`, `ValidatedEventHandler<Request, Response, Schemas>`,
`ValidationIssue`, `ValidationErrorData`, `ValidationSource`,
`SchemasOfHandler<H>`.

## Repository development

From the repository root:

```sh
pnpm --filter @dphonys/nuxt-handler-validation dev
pnpm --filter @dphonys/nuxt-handler-validation typecheck
pnpm --filter @dphonys/nuxt-handler-validation test
pnpm --filter @dphonys/nuxt-handler-validation build
pnpm --filter @dphonys/nuxt-handler-validation publint
```

## License

Licensed under the [MIT License](./LICENSE).
