# Nuxt Handler Validation

Declare a Nitro handler's request schemas once, and get the validated,
fully-typed values in the handler's second parameter - query, body, route
params and headers, validated via any [Standard Schema](https://standardschema.dev)
library _before_ the handler body runs. Failures answer with one stable,
documented wire shape, identical in dev and prod.

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
    validate: {
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

- **The schemas nest under `validate`**, keyed by source. The four sources are
  `routerParams`, `query`, `headers` and `body` - h3's own vocabulary, three of
  which are h3 v2's own `validate` keys. The nesting leaves a named slot free
  for a future combined wrapper with the sibling package (`{ validate, errors }`).
- **Each source slot holds a schema, or a non-empty tuple of schemas** - see
  [Composing schemas on one source](#composing-schemas-on-one-source).
- **Validated values arrive eagerly, fully typed, in the second parameter** -
  each source typed as its schema's _output_ type, so coercions and transforms
  land in the handler already applied. Undeclared sources are **absent** from
  that parameter - not `unknown`, not optional; reading one is a compile error.
- **Any Standard Schema works, mixed freely** - zod, valibot, anything with
  `~standard`, in any combination within one call, including inside one tuple.
  The contract is only the interface. **Async schemas are supported**; the
  wrapper awaits.
- The handler's **return type flows to Nitro's typed routes** unchanged: the
  wrapper returns a plain h3 `EventHandler`, so `$fetch` call sites infer the
  response exactly as with `defineEventHandler`. There is no phantom property
  and no wrapper type to unwrap.
- Everything above is auto-imported inside `server/`, the same ambient position
  as `defineEventHandler`. The explicit door is
  `@dphonys/nuxt-handler-validation/server` - the form that works where
  auto-imports do not reach: Nitro plugins and tasks, tests, non-Nuxt Nitro
  consumers, `imports.autoImport: false`. That entry carries the runtime and
  depends on h3, so nothing reaching the client may import it;
  `@dphonys/nuxt-handler-validation/types` is the type-only door for app code.

The name `defineValidatedEventHandler` mirrors the _current_ vanilla
`defineEventHandler`, so its role is obvious on sight. It is not h3 v2's
`defineValidatedHandler`: taking that name now would squat on the one h3 will
auto-import the day Nuxt ships it, and would break symmetry with the sibling's
`defineCheckedEventHandler`. Both packages rename together at that alignment
point instead.

### The second parameter is the validated door

The values in the second parameter are the validated ones, and they are the
only door to them. Each source is read **once** per request, before the handler
body runs; calling `readBody(event)` afterwards hands back h3's memoized
_unvalidated_ parse, not what the schema produced. Read what you declared from
the second parameter and nothing has to be re-parsed or re-checked.

## Composing schemas on one source

Reuse is a **plain schema value**. There is no definer, no set, no group and no
name to register - a Standard Schema already travels as an export, and it
carries no source keys to misspell.

```ts
// server/validation/listing.ts - reusable units are plain schema values.
import * as v from 'valibot'
import { z } from 'zod'

export const pagination = z.object({
  page: z.coerce.number(),
  size: z.coerce.number(),
})

export const sorting = v.object({ sort: v.picklist(['asc', 'desc']) })
```

```ts
// server/api/users/index.get.ts
import { pagination, sorting } from '~~/server/validation/listing'
import { profileBody } from '~~/server/validation/profile'

export default defineValidatedEventHandler(
  { validate: { query: [pagination, sorting], body: profileBody } },
  async (event, { query, body }) => {
    // query: { page: number, size: number } & { sort: 'asc' | 'desc' }
    return listUsers(query, body)
  }
)
```

- **Every element parses the whole raw source, in order**, and the delivered
  value is the merge of their outputs. The wire is untouched - the client still
  sends a flat `?page=1&size=20&sort=asc` - and an issue's `path` stays relative
  to that raw source.
- **Cross-library composition is free.** Tuple elements are independent Standard
  Schemas, so zod and valibot mix inside one tuple.
- **A tuple, not an array.** A widened `StandardSchemaV1[]` cannot say how many
  schemas it holds, so its merge could not be typed; the constraint turns it
  away, naming the tuple it wanted. Write the array literal inline, or
  `as const`.
- **A lone schema and a one-element tuple are the same declaration.** `x` and
  `[x]` deliver the same value, and neither has anything to merge - so a lone
  schema's output may be anything, primitives and unions included, and a union
  stays a union.
- **A set spanning several sources is just an object of schema values.** Export
  `{ headers, query }` from one file and let each route say which slot each
  schema fills. Explicit, no machinery.
- **Every element runs, sequentially, in tuple order - and issues aggregate.**
  An early element's failure does not stop the later ones: fail-fast is a rule
  _across_ sources, and within one source every issue arrives together in the
  one `400`, so reordering a tuple never changes what a client sees. Sequential
  rather than parallel, so async schemas run deterministically.

### Two composition rules, both at the declaration site

Composition - a tuple of two or more - has exactly two compile-time rules.
Both report **at the offending source key, at the declaration**, each with its
own sentence, verbatim:

1. **Every composed output must be an object** - not a primitive, an array or a
   function. The test is **structural**, not `Record<string, unknown>`:
   interfaces carry no implicit index signature, so an interface-typed output
   (a `z.custom<ThirdParty>()`, a hand-written schema) must not be falsely
   refused.
2. **Their output keys must be pairwise disjoint.** An intersection would lie
   about which value survives, so the overlap is refused; the escape is merging
   at the schema-library level (`.extend`, `v.intersect`, ...) or renaming a
   key. Composing the _same_ schema twice (`[pagination, pagination]`) is an
   overlap too.

The object rule runs first, so a non-object output never gets the overlap
sentence. There are no lazy poisons that wait for a property access: with
composition scoped to one source in one place, the mistake site and the error
site are the same place.

**Three sentences, and they are the surface.** These are what a broken
declaration prints, verbatim - the two rules above and the stray-key rule from
the next section:

```text
every schema composed on one source must produce an object output - not a primitive, an array or a function
schemas composed on one source must produce disjoint output keys - merge them in your schema library instead
'boyd' is not a validation source - the sources are routerParams, query, headers and body
```

**What the flat merge costs.** The delivered value satisfies each part
structurally - `helper(query)` typed off `pagination` alone still typechecks -
but the other elements' keys ride along, and an exact-type position would see
them. The promise is "existing keys do not change", not "the shape does not
change".

## Only the four source keys, and misuse stays humane

A typo'd or stray key is rejected **even when it sits beside valid ones** -
`{ query: q, boyd: schema }` is a compile error, not a body that silently never
validates. It reports at that key with this package's own sentence - the third
of the three above - rather than a bare "not assignable to `never`".

- **The wrapper has one signature**, so no rejection collapses into a
  `TS2769: No overload matches this call` paragraph. Every diagnostic lands at
  the key that caused it.
- **A value that is not a schema is rejected at the offending property** - the
  slot constraint says the whole of it, so no sentence of this package's own is
  invented to bury it.
- **Reading an undeclared source in the handler names the missing key**, as a
  `Property 'body' does not exist on type 'ValidatedContext<...>'`.
- **Declare with `satisfies`, never with `: ValidationSchemas`.** See
  [What this does not catch](#what-this-does-not-catch).

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
  source - across its composed tuple as well as within one schema - still
  arrive together.
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
package absorbs into a single `body` issue. Every developer mistake this package
raises carries none, so the recipe above still reports every one of them. A
marker meaning "raised by this package" would let a well-meaning
`if (recognizeValidationError(error)) return` swallow exactly the bugs that must
keep reporting.

There is deliberately **no `unhandled === false` half** here, unlike the
sibling's recipe: this marker is a non-serialized symbol rather than a field
inside `data`, so the case that check discriminates cannot arise.

## Developer errors this package raises

The compile-time rules above are the guard for typed callers. For the callers
the types cannot see - plain JS, an `any`-typed schema - and for runtime values
the types cannot see - a passthrough key riding into an otherwise-disjoint
merge, a transform whose declared output is a lie - the runtime mirrors those
rules. **None of these is marked**, so `recognizeValidationError` returns
`undefined` for every one of them and an observability hook still reports them.

**When the route file is evaluated**, before any request is served: a source
slot holding something that is not a Standard Schema throws a plain `Error`
naming the source and the element index. It is a plain `Error` rather than a
`500` because there is no request to answer yet - the route never becomes
servable. Answering it here is what keeps a `null` in a slot from becoming an
unattributed `TypeError: Cannot read properties of null (reading '~standard')`
on every request the route ever serves. This is the one malformed declaration
knowable without a request.

**Per request**, as a plain unmarked `500` naming the source:

| what happened                                                             | when it is detected                          |
| ------------------------------------------------------------------------- | -------------------------------------------- |
| an element output that is not a plain object at merge time                | after the tuple ran; names the element index |
| an element that reported neither a value nor any issue (`{ issues: [] }`) | after the tuple ran; names the element index |
| a source declared with an empty tuple, so nothing validated it            | at merge time                                |

They are latent by nature: such a route serves `200`s until a request reaches
the case, and hoisting them is impossible - what a schema answers is unknowable
without running it. The principle behind all three is one rule: **a declared
source must be delivered as something every element actually contributed to.**
Delivering `{}` for a source nothing validated, or dropping an element whose
result named no output, would be silent data loss behind a handler parameter
whose whole promise is that its values were validated.

**Overlapping keys the guard could not prove merge later-wins, in tuple order.**
The merge is a plain object spread - spread intuition, at zero per-request cost.
There is no per-request overlap detection: paying for one on every request to
re-check what the declaration already refused would be the wrong trade.

## What this does not catch

Stated honestly, because a guard that is trusted for more than it does is worse
than one whose edges are written down.

- **Overlap between outputs carrying an index signature is unprovable, so it is
  allowed.** `z.looseObject`, `z.record` and any passthrough output widen
  `keyof` to `string`, taking their named keys down with it, so the guard cannot
  compare them against a sibling's without refusing every merge they appear in -
  a refusal whose sentence would name the wrong cause. Such outputs contribute
  nothing to the overlap rule instead, and the runtime's later-wins spread, in
  tuple order, is what decides the keys that collide.
- **An `any`-typed element is accepted, and takes the whole slot with it.** The
  guard answers `any` before the object test, deliberately: `any` satisfies both
  branches of every conditional, so refusing it would make the runtime backstop
  unreachable from typed code. The cost is that the slot's delivered type
  becomes `any` - the honest report, since an element that promises nothing
  cannot be merged into a promise.
- **Exotic object outputs pass the compile gate.** A `Date`, a `Map` or any
  class instance _is_ an object structurally, so the declaration is accepted; the
  runtime merge refuses it with the `500` above, because its meaning lives
  outside its own enumerable keys and a spread would take the keys and drop the
  meaning. That is the accepted cost of the object test being structural rather
  than `Record`-based.
- **A declaration annotated `: ValidationSchemas` compiles but delivers no
  readable sources.** Use `satisfies ValidationSchemas`, or leave the literal
  inline:

  ```ts
  // Wrong: `validated.query` is a compile error, even though query is declared.
  const schemas: ValidationSchemas = { query: pagination }

  // Right: the inferred literal is what the second parameter is computed from.
  const schemas = { query: pagination } satisfies ValidationSchemas
  ```

  The annotation throws away the very value the inference needed. The second
  parameter is mapped over the declaration's **inferred** keys, and a key is
  delivered only when its slot cannot be `undefined`; annotating replaces the
  literal's one known key with the interface's four optional ones, so nothing is
  guaranteed and nothing is delivered. Every read is then the same compile error
  a genuinely undeclared source gets - including the source you did write.

- **A malformed `validate` object itself is an untyped `TypeError`.** A `null`
  in place of the object, or a `validate` key missing altogether from a plain-JS
  route file, fails inside the declaration walk at route evaluation without this
  package's name on it. The guard covers what is _inside_ `validate`, not the
  object in its place.
- **An empty tuple is a per-request `500`, not a route-evaluation refusal.**
  `query: []` from plain JS passes the route-evaluation walk - there is no
  element to reject - and is answered by the unmarked `500` above, once per
  request, rather than once at evaluation.

Two capabilities v1 had are gone on purpose, not overlooked:

- **Named output nesting.** v1's `query.pagination` was _exactly_ the pagination
  schema's output, with no other set's keys riding along. The flat merge is
  structural instead - see
  [Two composition rules](#two-composition-rules-both-at-the-declaration-site).
- **Overlap resolved by naming.** v1's escape from an overlap was a set name;
  the escape now is a schema-library merge or a rename.

## The public surface

Runtime, from `@dphonys/nuxt-handler-validation/server`, both auto-imported
inside `server/`:

| Export                                          | Role                                                                                    |
| ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| `defineValidatedEventHandler({ validate }, fn)` | The wrapper. One signature. Returns a plain h3 `EventHandler`.                          |
| `recognizeValidationError(error)`               | Observability predicate, process-side only. Returns `ValidationErrorData \| undefined`. |

Types, from `@dphonys/nuxt-handler-validation/types` - type-only, safe to import
from app code: `ValidationSchemas`, `SourceSchemas`, `ValidationSource`,
`ValidatedContext<S>`, `SourceValue<T>`, `MergedOutput<T>`, `OutputOf<S>`,
`ValidationIssue`, `ValidationErrorData`.

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
