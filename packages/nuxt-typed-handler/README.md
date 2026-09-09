# Nuxt Typed Handler

Declare a Nitro handler's request schemas and expected failures once, and get
both typed at every call site: the compiler knows what a route accepts as
`body` and `query`, and what it can answer with. One wrapper,
`defineTypedEventHandler`, and one flat second parameter carrying the validated
values and local `errors` factories.

One sentence for the whole model: **a route declares what it validates and
what it can fail with, and every caller - `useTypedFetch`, `$typedFetch`,
`event.$typedFetch` - is typed from the route path alone.**

This module composes [`@dphonys/nuxt-handler-errors`][errors] and
[`@dphonys/nuxt-handler-validation`][validation] and is installed _instead of_
them - never alongside. It re-exports both parents' public surface, bar their
two wrappers, so an app imports everything from one package. Each feature
below links to the parent that documents it in full.

## Installation

```sh
pnpm add @dphonys/nuxt-typed-handler
```

```ts
export default defineNuxtConfig({
  modules: ['@dphonys/nuxt-typed-handler'],
})
```

The module has two options: `channelToken` - see [Channel
gating](#channel-gating) - and `checkResponses`, the development-only response
check the validation parent owns, on by default and turned off with
`typedHandler: { checkResponses: false }`. Nothing about a route's inputs, its
failures or its output is configured; all three are declared, in the route.

Bring your own schema library. Anything implementing [Standard
Schema](https://standardschema.dev) works - [zod](https://zod.dev),
[valibot](https://valibot.dev), [arktype](https://arktype.io), and others -
nothing is bundled for you.

**Requirements:** Nuxt `>=4.5.1 <5.0.0`, Node 22.19+ / 24.11+ / 26+.

If the app already uses a parent, remove it from `modules` and uninstall it
first - registering a parent beside this module throws at startup. See
[Migrating from the parents](#migrating-from-the-parents).

## Quick start

```ts
// server/api/users.post.ts
import { z } from 'zod'

const createUser = z.object({
  name: z.string().min(1),
  email: z.email(),
})

const userErrors = defineError({
  'user-exists': {
    status: 409,
    payload: z.object({ email: z.string().trim().toLowerCase() }),
  },
})

export default defineTypedEventHandler(
  {
    input: { body: createUser },
    errors: [...userErrors],
    output: z.object({ created: z.string() }),
  },
  async (event, { body, errors }) => {
    if (await taken(body.email)) throw errors.userExists({ email: body.email })

    return { created: body.name }
  }
)
```

```vue
<script setup lang="ts">
import { matchError } from '@dphonys/nuxt-typed-handler/shared'

// `body` is typed and required - the compiler knows this route declares one.
const { error } = await useTypedFetch('/api/users', {
  method: 'post',
  body: { name: 'Ada', email: 'ada@example.com' },
})

matchError(
  error,
  {
    'user-exists': (e) => snack(`${e.email} is taken`),
    'validation-failed': (e) => showIssues(e.issues),
  },
  (err) => showError(err)
)
</script>
```

- **`input`, `errors` and `output` are each valid alone**, and in any
  combination; the context carries only what was declared: no `input`, no
  source keys; no `errors`, no factories; no map-form `output`, no `respond`.
  Declaring none of the three is a compile error, and a runtime one for a
  JavaScript caller.
- **Your return type flows to Nitro's typed routes unchanged.** The wrapper
  returns a `TypedEventHandler` - still assignable to h3's `EventHandler` - so
  the response type infers exactly as it would with `defineEventHandler`. A
  route that declares `output` additionally constrains its return to the
  declared schemas' output types - see [Response output](#response-output).
- **Auto-imported where you use it.** `defineTypedEventHandler`, `defineError`,
  `recognizeKnownError` and `recognizeValidationError` are ambient
  inside `server/`, like `defineEventHandler`; `useTypedFetch` and its siblings
  are ambient in app code, like `useFetch`; `$typedFetch` is a global, like
  `$fetch`. `matchError` is imported from `@dphonys/nuxt-typed-handler/shared`,
  because it is used on both sides.
- **Three entries.** `@dphonys/nuxt-typed-handler/server` carries the runtime
  and depends on h3 - import it where auto-imports do not reach (Nitro plugins
  and tasks, tests, `imports.autoImport: false`), never from client code.
  `/shared` is safe everywhere. `/types` is type-only, for app code.

## Declaring what a route can fail with

```ts
// server/api/users/[id].get.ts
import { z } from 'zod'

const unauthorized = defineError('unauthorized', { status: 401 })
const userErrors = defineError({
  'user-not-found': { status: 404, payload: z.object({ userId: z.string() }) },
  'user-suspended': { status: 403, payload: z.object({ until: z.string() }) },
})

export default defineTypedEventHandler(
  {
    errors: [...userErrors.pick('user-not-found'), unauthorized],
  },
  async (event, { errors }) => {
    if (!(await authenticated(event))) throw errors.unauthorized()
    const userId = event.context.params?.id ?? ''
    const user = await lookup(userId)

    if (!user) throw errors.userNotFound({ userId })

    return user
  }
)
```

- **Declarations are reusable; selection is endpoint-local.** `defineError`
  creates singles or groups with tags, HTTP error `status` (400-599), and
  optional `payload`. Export them from `server/errors/` when useful. Spread
  groups, combine them with singles, or select a subset with `.pick()`.
- **Tags are kebab-case; factories are camelCase.** Declare
  `'user-not-found'`, match on `'user-not-found'` at the call site, and throw
  `errors.userNotFound(...)` in the handler. A tag is lowercase ASCII letters
  and digits in `-`-separated words, each word starting with a letter.
  Anything else, `userNotFound` included, is a compile error
  (`__invalidTag__`) and a declaration-time throw.
- **Factories are synchronous.** Write `throw errors.userNotFound({ userId })`.
  The argument is the schema's input; a definition without `payload` has a
  zero-argument factory. Undeclared factory keys are compile errors.
- **Payload schemas execute** inside the factory call, so never `await` a
  factory. Schemas must validate synchronously; an asynchronous schema throws
  a `TypeError` from the factory. Schema output
  (including transforms) reaches the client as flat fields such as `e.userId`
  and must be a JSON-serializable object without `tag` or `status` keys.
  Invalid factory payloads are programmer errors answering an
  unmarked **500**, not a declared failure or `validation-failed`.
- Success return values and their inferred types are unchanged; errors do not
  add a success envelope. Clients still match exhaustively by tag.
- **`'validation-failed'` is reserved on every route**, whether or not it
  validates: declaring it is a compile error and a declaration-time throw, and
  there is no local factory for it.

Rationale, and the full model: [Declaring what a route can fail with][errors-declaring].

## Validating the request

```ts
export default defineTypedEventHandler(
  {
    input: {
      route: v.object({ id: v.pipe(v.string(), v.transform(Number)) }),
      query: [pagination, sorting],
      body: z.object({ name: z.string() }),
    },
  },
  async (event, { route, query, body }) => update(route.id, body)
)
```

- **Schemas nest under `input`**, keyed by source. The four sources are
  `route`, `query`, `headers` and `body`, validated in exactly that
  order, **fail-fast**, before the handler body runs.
- Values arrive typed as their schema's **output**, so coercions and transforms
  land already applied. Undeclared sources are **absent** from the context.
- **Mix libraries freely**, including inside one composed tuple. Async schemas
  are awaited.
- A tuple composes several schemas onto one source: every element parses the
  whole raw source in order and you receive the merge. Two compile-time rules,
  both reported at the offending source key: every composed output must be an
  **object**, and their output keys must be **pairwise disjoint**.
- Sources arrive exactly as h3 yields them - query values are
  `string | string[]`, headers are lowercased, route params are URL-decoded -
  so all coercion belongs in the schema.
- A method that cannot carry a body, and an empty body, both validate
  `undefined`. A body the request made unreadable becomes exactly one issue,
  `{ source: 'body', message: 'Request body could not be parsed', path: [] }`.

Rationale, the per-source detail and the composition rules in full:
[Reusing and composing schemas][validation-composing] and [What each source
receives][validation-sources].

## The Handler context

The wrapper's second parameter is one flat object, built fresh per request:

```text
(event, { route, query, headers, body, errors, respond }) => …
```

- **Only what was declared is there.** Each validated source appears iff
  `input` declared it; `errors` appears when an error array is declared;
  `respond` appears when `output` is a status map. Reading an undeclared key is
  a compile error naming the key.
- **It is the only door to validated values.** Calling `readBody(event)` in the
  handler hands back h3's memoized _unvalidated_ parse - not what your schema
  produced.
- **An `errors`-only route never reads the request.** No validation plan or body
  read. Nor does an `output`-only one.
- The factories are frozen and scoped to the endpoint's declaration.

## Response output

`output` is the validation parent's declaration, forwarded whole: a bare schema
declares a single `200` the handler returns plainly, and a status map declares
one reply per status and puts `respond` in the Handler context, beside `errors`.

```ts
// server/api/drafts.post.ts
export default defineTypedEventHandler(
  {
    input: { body: draftBody },
    errors: [...draftErrors],
    output: { 200: draftRef, 201: draftCreated, 204: null },
  },
  async (event, { body, errors, respond }) => {
    const existing = await find(body.ref)

    if (existing?.locked) throw errors.draftLocked({ ref: body.ref })
    if (existing) return respond(200, { id: existing.id })
    if (body.discard) return respond(204)

    const draft = await create(body)

    return respond(201, { id: draft.id, createdAt: draft.createdAt })
  }
)
```

- **A route either fails or answers.** Throwing a Known error and returning
  through `respond` are the two exits, and the two unions - the error union and
  the body union - are typed apart; neither widens the other.
- **`respond` is offered by the map form only**, exactly as `errors` is offered
  only by a declared error array. `respond(status, value)` checks the two
  together, a status the map never declared is a compile error, and a plain
  return is one too. A development server refuses that status again, for the
  caller who never saw those types.
- **A status mapped to `null` has no body.** `respond(204)` takes no value, and
  `respond(204, value)` is a compile error.
- **An `output`-only route is a declaration.** It has no source keys, no
  `validation-failed` variant, and no Request typing at the call site.
- **The client sees the bodies, not the status.** Fetch infers the union of the
  mapped outputs, exactly as it infers a plain return.
- **The development-only response check runs here too**, on by default: on a
  development server the declared schema is asserted against the value the
  handler handed over, and a mismatch is a plain `500`; so is responding under a
  status the map never declared, refused before that status reaches the
  response. The result is discarded, so development sends the bytes production
  sends. This module forwards the parent's option as
  `typedHandler: { checkResponses: false }`.

Both forms in full, every rejection the compiler writes, and the check's `500`:
[Response output][validation-output].

## Request typing at the call site

Every member of the [Typed fetch family](#fetching) takes
`TypedRequestOptions<R, M>` - vanilla's `NitroFetchOptions` with `body` and
`query` typed from the route's declared schemas, `method` accepted in either
case, and ofetch's deprecated `params` alias removed for everyone.

```ts
// `body` required and typed from the schema's *input* side.
await $typedFetch('/api/users', {
  method: 'post',
  body: { name: 'Ada', email: 'a@b.c' },
})

// Excess keys rejected on a plain object literal: `nope` is an error here.
await $typedFetch('/api/users', {
  method: 'post',
  body: { name: 'Ada', nope: 1 },
})

// `page` is `string` here: what the client sends, before `z.coerce`.
await $typedFetch('/api/search', { query: { page: '2' } })
```

- **Typed per `(route, method)`.** The method defaults to `get` when the route
  has one, else to the one it has - Nuxt's own rule.
- **Required iff sending nothing would fail validation.** An all-optional
  schema keeps the option optional, but typed.
- **The types read the schemas' _input_ side**, not the handler's values: a
  `z.coerce.number()` query is `string` at the call site and `number` in the
  handler.
- **An undeclared source is untouched**, whatever else the route declares - it
  types exactly as vanilla types it.
- **A route this module did not produce degrades to vanilla**, key for key.

### What the types can and cannot see

- **Reactive sources weaken excess-key rejection on `useTypedFetch`.** A plain
  object literal is excess-key checked; the same value behind `ref()` or a
  getter is not - the option is a union of reactive forms, and `ref()` infers
  its own type. Values are still checked; only the extra key slips through.
- **`body` is omitted on `get` / `head` for routes that declare validation.**
  On a branded route the option is gone rather than typed, so a `get` cannot
  carry one. An unbranded route keeps vanilla's `body` on every method, which
  is what makes the degradation key for key.

## Handling failures

```ts
matchError(
  error,
  {
    'user-not-found': (e) => notFound(e.userId),
    'validation-failed': (e) => showIssues(e.issues),
  },
  (err, unrecognized) => {
    if (unrecognized) return report(`unknown failure: ${unrecognized.tag}`)
    showError(err)
  }
)
```

One call absorbs the `if (error)` and the is-it-known check. **The arms are
exhaustive over what the route declared**, each arm receives the whole variant,
and the fallback is positional and required. Local factory variants carry
`{ tag, status, ...payload }` (just `tag` and `status` without a payload); the built-in
validation variant keeps its top-level `issues`. `matchError` is imported from
`@dphonys/nuxt-typed-handler/shared` - it is used on the server too.

### The built-in `validation-failed` variant

Every route that declares any `input` source implicitly declares one extra
variant, `validation-failed`, `400`, carrying the rejected source's issues.
It is always on, it has no local factory, and the wire is a known
error rather than the validation parent's own `400`. A route that declares no
source - `errors` alone, `output` alone, or the two together - carries no such
variant:

```jsonc
{
  "statusCode": 400,
  "message": "validation-failed", // the tag; no `statusMessage`
  "data": {
    "issues": [
      { "source": "query", "message": "Expected number", "path": ["page"] },
    ],
  },
}
```

The known-error marker rides in `data` beside `issues` and is stripped for
callers off the channel, exactly as for any known error - `data.issues`
survives, so a plain `$fetch` client still reads
`err.data.data.issues`. Both predicates answer on the thrown error:
`recognizeKnownError` returns `{ tag: 'validation-failed', status: 400, issues }`
and `recognizeValidationError` returns `{ issues }`.

Issues are the validation parent's projection - `{ source, message, path }` and
nothing else - and one failure's issues all share one `source`, one of `route`,
`query`, `headers` and `body`, because validation is fail-fast. The
unparseable-body case arrives as the same variant.

### An `input`-only route is still typed

```ts
const { data, error } = await $typedFetch.try('/api/search', {
  query: { page: 'nope' },
})

if (error) {
  matchError(
    error, // typed as exactly `validation-failed`
    { 'validation-failed': (e) => showIssues(e.issues) },
    (err) => showError(err)
  )
  return null
}

return data // narrowed to the route's response type
```

## Fetching

Five composables - `useTypedFetch`, `useLazyTypedFetch`,
`useRequestTypedFetch`, `useTypedAsyncData`, `useLazyTypedAsyncData` - one
global, `$typedFetch`, and one event-bound instance, `event.$typedFetch`. Each
mirrors its vanilla counterpart and adds the route's typed request options and
error union.

- **`$typedFetch(…)` is vanilla: it throws.** `$typedFetch.try(…)` returns
  `{ data, error }` - a discriminated union, so `if (error) return` narrows
  `data` with no second guard. `.raw`, `.native` and `.create(defaults)` are
  ofetch's, forwarded.
- **`useTypedAsyncData`** is vanilla `useAsyncData` over a handler that returns
  `.try` results instead of throwing; the union rides the handler's return
  type, so no route is ever restated and forgetting `.try` is a compile error.
  Request-side it adds nothing - the inner `$typedFetch.try` call types its own
  options.
- **`event.$typedFetch`** is the server-to-server instance: same shape, with
  `throw` as the exit, forwarding the request's cookies and headers. Always
  `.try` plus translation arms - letting a callee's failure escape leaks its
  status line as your route's answer.
- **`useRequestTypedFetch()`** mirrors Nuxt's `useRequestFetch()`: the
  event-bound instance while rendering, the global on the client.

Rationale and the longer worked examples: [Fetching][errors-fetching].

## Channel gating

Responses to callers that are **not your app** go out with the known-error
marker stripped: third parties get an ordinary error response, while your own
calls - browser and SSR alike - get the full wire. This is **on by default**,
under the default channel token `'nuxt-typed-handler'`.

```ts
export default defineNuxtConfig({
  modules: ['@dphonys/nuxt-typed-handler'],
  typedHandler: { channelToken: 'my-app' },
})
```

- Every fetch surface of this module sends the token as the
  `x-known-error-channel` request header; the match is always **by value**.
- **The token is a channel tag, not a secret.** It ships in the client bundle
  by design, marks first-party intent, and authorises nothing.
- **It is build-time**: a module option baked into both bundles. No env
  override, no runtime config; changing it is a rebuild.
- `channelToken: false` turns gating off entirely. `''` disables it too but
  warns, because only `false` can mean it on purpose.
- **The thrown error always carries the marker** - only the serialized response
  is ever stripped, so observability sees failures identically no matter who
  called.

Rationale: [Channel gating][errors-channel].

## Observability

One hook, and this module suppresses nothing on its own:

```ts
// server/plugins/observability.ts
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error) => {
    // A route's own declared failure, `validation-failed` included.
    if (recognizeKnownError(error) && error.unhandled === false) return

    report(error)
  })
})
```

The same predicate works in Sentry's `beforeSend` over
`hint.originalException`. The `unhandled === false` half is load-bearing: a
declared failure that **escaped** an inner handler reaches the hook carrying a
marker too, and that one is a caller bug that must keep reporting - so it must
not be added to the arm above.

**Both predicates answer on a `validation-failed` error**, by design:
`recognizeKnownError` returns the variant `{ tag, status, issues }` and
`recognizeValidationError` returns `{ issues }`. Reach for the second one when
input rejections are routed somewhere else than declared failures; it answers
`undefined` for every other failure, including a route's own error factories.

## Turning the module off

There is no `typedHandler: false`. `typedHandler` is a flat bag with exactly
two keys, `channelToken` and `checkResponses` - a stray key is a compile error.
To turn the module off, remove `'@dphonys/nuxt-typed-handler'` from `modules`.

## Troubleshooting

### A parent is registered beside this module

```text
[nuxt-typed-handler] `@dphonys/nuxt-handler-errors` is also registered in `modules`. @dphonys/nuxt-typed-handler replaces it: remove `@dphonys/nuxt-handler-errors` (and uninstall it), then move any `channelToken` under `typedHandler`.
```

Thrown at `modules:done`, once for the first parent found, whether the parent
was listed by package name or as a module value. This module _replaces_ both
parents; running them side by side would give a route two wrappers, two channel
tokens and two generated maps.

### A leftover parent config key

```text
[nuxt-typed-handler] `handlerErrors` in nuxt.config is ignored: this module replaces the parent it configured. Move `channelToken` under `typedHandler` and delete `handlerErrors`.
```

Warned once per key, for `handlerErrors` and `handlerValidation`, whenever the
key is present at all - `handlerValidation: false` included, since there is
nothing left for it to switch off.

### `'validation-failed'` in a route's declared errors

```text
[nuxt-typed-handler] The error tag "validation-failed" is reserved for the built-in validation variant. Rename the declared error.
```

The compile guard says the same thing at the declaration
(`__reservedErrorTag__: 'validation-failed is reserved for the built-in variant'`);
this throw is the answer a JavaScript caller gets. Rename the declared variant.

### `satisfies`, never `: ValidationSchemas`

This is the one footgun worth memorizing. Annotating a declaration compiles,
but delivers no readable sources:

```ts
// Wrong: `ctx.query` is a compile error, even though query is declared.
const schemas: ValidationSchemas = { query: pagination }

// Right: the inferred literal is what the second parameter is computed from.
const schemas = { query: pagination } satisfies ValidationSchemas
```

The annotation throws away the very value the inference needed. Leave the
literal inline, or use `satisfies`.

Everything else is documented where the rule lives: the parents' own
declaration diagnostics, the runtime errors for what the types cannot see and
the edges the compile-time guard does not catch are in
[Troubleshooting][validation-troubleshooting] in the validation parent, and
[When the call site does not know the tag][errors-unknown-tag] in the errors
parent.

## Migrating from the parents

Already on `@dphonys/nuxt-handler-errors` or
`@dphonys/nuxt-handler-validation`? Almost everything is a rename.

| Before                                                                                                                                                                                   | After                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `modules: ['@dphonys/nuxt-handler-errors', '@dphonys/nuxt-handler-validation']`                                                                                                          | `modules: ['@dphonys/nuxt-typed-handler']`                                                                                                             |
| `handlerErrors: { channelToken }` / `handlerValidation: { checkResponses }`                                                                                                              | `typedHandler: { channelToken, checkResponses }`                                                                                                       |
| `defineCheckedEventHandler({ errors }, …)` / `defineValidatedEventHandler({ input, output }, …)`                                                                                         | `defineTypedEventHandler({ errors \| input \| output }, …)`                                                                                            |
| `useCheckedFetch`, `useLazyCheckedFetch`, `useRequestCheckedFetch`, `useCheckedAsyncData`, `useLazyCheckedAsyncData`, `$checkedFetch`(`.try`), `event.$checkedFetch`                     | `useTypedFetch`, `useLazyTypedFetch`, `useRequestTypedFetch`, `useTypedAsyncData`, `useLazyTypedAsyncData`, `$typedFetch`(`.try`), `event.$typedFetch` |
| imports from `@dphonys/nuxt-handler-errors/{shared,types}` and `@dphonys/nuxt-handler-validation/types`                                                                                  | the same names from `@dphonys/nuxt-typed-handler/{shared,types}`                                                                                       |
| **Unchanged:** `defineError`, `matchError`, `recognizeKnownError`, `recognizeValidationError`, `KnownErrorsOfRoute`, `ValidationErrorData`, `ValidationSchemas`, every other parent name | same name, new specifier only                                                                                                                          |

Substitute **exact identifiers**, never the bare words `Checked` or
`Validated`, which would also hit kept names such as `CheckedEventHandler`
and `ValidatedContext`. With GNU `sed` and
[ripgrep](https://github.com/BurntSushi/ripgrep), from the app root:

```sh
rg -l --glob '!node_modules' -e 'defineCheckedEventHandler|defineValidatedEventHandler|use(Lazy)?Checked(Fetch|AsyncData)|useRequestCheckedFetch|\$checkedFetch|@dphonys/nuxt-handler-(errors|validation)/' | xargs sed -i -e 's/defineCheckedEventHandler/defineTypedEventHandler/g' -e 's/defineValidatedEventHandler/defineTypedEventHandler/g' -e 's/useRequestCheckedFetch/useRequestTypedFetch/g' -e 's/useLazyCheckedFetch/useLazyTypedFetch/g' -e 's/useCheckedFetch/useTypedFetch/g' -e 's/useLazyCheckedAsyncData/useLazyTypedAsyncData/g' -e 's/useCheckedAsyncData/useTypedAsyncData/g' -e 's/\$checkedFetch/$typedFetch/g' -e 's#@dphonys/nuxt-handler-errors/\(server\|shared\|types\)#@dphonys/nuxt-typed-handler/\1#g' -e 's#@dphonys/nuxt-handler-validation/\(server\|types\)#@dphonys/nuxt-typed-handler/\1#g'
```

`nuxt.config` is deliberately outside that pass - its option keys need a
judgement no substitution can make. Edit it by hand: replace both `modules`
entries with `'@dphonys/nuxt-typed-handler'`, rename `handlerErrors:
{ channelToken }` to `typedHandler: { channelToken }`, and **delete**
`handlerValidation` rather than renaming it - moving its `checkResponses` under
`typedHandler` if it was set. Renaming both keys would collide in one object,
and `handlerValidation: false` would become a `typedHandler: false` this module
has no off-switch for.

### Not a rename: a hand-nested route becomes one flat context

Composing the two parents by hand gave a route **two** second parameters -
`{ errors }` from the outer wrapper, the validated values from the inner one.
Under the umbrella there is one wrapper and one context.

```ts
// Before - two wrappers, two second parameters, one call forwarded by hand.
const userErrors = defineError({
  'user-exists': { status: 409, payload: z.object({ email: z.string() }) },
})

export default defineCheckedEventHandler(
  {
    errors: [...userErrors],
  },
  (event, { errors }) =>
    defineValidatedEventHandler(
      { input: { body: createUser } },
      (_event, { body }) => {
        if (taken(body.email)) throw errors.userExists({ email: body.email })
        return create(body)
      }
    )(event)
)
```

```ts
// After - one wrapper, one flat Handler context.
export default defineTypedEventHandler(
  {
    input: { body: createUser },
    errors: [...userErrors],
  },
  (event, { body, errors }) => {
    if (taken(body.email)) throw errors.userExists({ email: body.email })
    return create(body)
  }
)
```

### Not a rename: the default channel token changes

The default token moves from `'nuxt-handler-errors'` to
`'nuxt-typed-handler'`. Every first-party fetch surface follows automatically -
the composables, the globals and `event.$typedFetch` all send the new value.
Only a **non-Nuxt client that hard-coded** the old `x-known-error-channel`
value has to change. Pinning your own `channelToken` makes this a non-event.

### Not a rename: `input`-only routes gain a typed failure

Under the validation parent a rejected request answered its own `400` and the
call site saw an untyped `FetchError`. Under the umbrella every validating
route implicitly declares `validation-failed`, so:

- `.try` and `useTypedFetch` type the `error` as a union that **includes**
  `validation-failed` - a new exhaustive arm your existing `matchError` calls
  do not have yet, reported by the compiler;
- the wire becomes the known-error body ([Handling
  failures](#handling-failures)): `message` is the tag and there is no
  `statusMessage: 'Validation Error'` to branch on.

Code that read `error.data.data.issues` off a raw `FetchError` still finds the
issues there, but move it to `matchError`'s `validation-failed` arm (client) or
`recognizeValidationError` (server) - both are typed, and neither depends on
the envelope.

### `handlerValidation: false` has no equivalent

See [Turning the module off](#turning-the-module-off). Its one key does have
one: `handlerValidation: { checkResponses }` becomes
`typedHandler: { checkResponses }`.

### The order to do it in

1. Swap `modules` to `['@dphonys/nuxt-typed-handler']` and uninstall both
   parents.
2. Run the one-liner above.
3. Fix the three non-renames.
4. Run `nuxt typecheck`.

**Step 1 breaks the build until step 2, by design.** The sibling throw is the
guard against a half-migration: an app cannot sit with one foot in each model.

## API reference

Umbrella-owned surface, in three positions. `defineTypedEventHandler` comes
from `@dphonys/nuxt-typed-handler/server` and is auto-imported inside
`server/`. The five composables are **app-side auto-imports** and are exported
from no package entry - write them bare, as you would `useFetch`; the two
fetch handles are globals. Types come from
`@dphonys/nuxt-typed-handler/types`, which is type-only and safe to import
from components.

| Export                                                          | Role                                                                                                                                |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `defineTypedEventHandler({ input, errors, output }, fn)`        | The two-argument wrapper; at least one of the three keys. `errors` selects an array of declarations. Returns a `TypedEventHandler`. |
| `useTypedFetch` / `useLazyTypedFetch`                           | `useFetch` with the route's Request input on the options and its error union on the `error` ref.                                    |
| `useTypedAsyncData` / `useLazyTypedAsyncData`                   | `useAsyncData` over a handler returning `.try` results.                                                                             |
| `useRequestTypedFetch()`                                        | The request-bound instance for SSR-safe imperative calls; the global on the client.                                                 |
| `$typedFetch` (`.try`, `.raw`, `.native`, `.create`)            | The global typed fetch; `.try` returns `{ data, error }` instead of throwing.                                                       |
| `event.$typedFetch`                                             | The event-bound instance, forwarding the request's identity.                                                                        |
| `TypedRequestOptions<R, M>`                                     | The options every family member takes for a route and method.                                                                       |
| `TypedFetch`, `TypedFetchTry`, `$TypedFetch`, `TypedEventFetch` | The fetch signatures behind those bindings.                                                                                         |
| `TypedEventHandler`                                             | What the wrapper returns: an h3 `EventHandler` carrying both parents' brands.                                                       |
| `TypedContext<S, A, O>`                                         | Validated sources, `respond` for a map-form `output`, plus local `errors` factories for declaration array `A`.                      |
| `TypedErrors<S, A>`                                             | Declared variants plus `ValidationFailed` iff the route validates.                                                                  |
| `TypedHandlerFn<S, A, …>`, `DefineTypedEventHandler`            | The handler function shape and the wrapper's call signatures.                                                                       |
| `AtLeastOne<S, A, O>`, `ReservedTagGuard<A>`                    | Compile-time guards for empty declarations (`declare input, errors, output, or any combination`) and the reserved validation tag.   |
| `ValidationFailed`                                              | `{ tag: 'validation-failed'; status: 400; issues: ValidationIssue[] }`.                                                             |
| `RequestInputOfRoute<R, M>`                                     | A route's declared Request input from its path alone; `never` means "declares no sources".                                          |
| `KnownApiRequestInputs`                                         | The generated map of every route's Request input - you never write to it.                                                           |
| `ModuleOptions`                                                 | From `@dphonys/nuxt-typed-handler`: `{ channelToken: string \| false; checkResponses: boolean }`.                                   |

### Re-exported from the parents

Same names, new specifier. Roles are documented in the parent that owns them
([errors][errors], [validation][validation]).

**`@dphonys/nuxt-typed-handler/server`** (all auto-imported inside `server/`):
`defineError`, `recognizeKnownError`, `recognizeValidationError`.

**`@dphonys/nuxt-typed-handler/shared`**: `matchError`, `KNOWN_ERROR_KEY`.

**`@dphonys/nuxt-typed-handler/types`**, from `nuxt-handler-errors`:
`$CheckedFetch`, `CheckedEventHandler`, `CheckedFetch`, `ErrorFactories`, `Fallback`,
`KnownApiErrors`, `KnownError`, `KnownErrorBody`, `KnownErrorCarrier`,
`KnownErrorFor`, `KnownErrorGroup`, `KnownErrorKey`, `KnownErrorsOf`,
`KnownErrorsOfHandler`, `KnownErrorsOfRoute`, `KnownVariant`, `TryResult`,
`VariantsOf`.

**`@dphonys/nuxt-typed-handler/types`**, from `nuxt-handler-validation`:
`DeclareSomething`, `HandlerReturn`, `InputOf`, `MergedInput`, `MergedOutput`,
`OutputOf`, `RequestInput`, `RequestInputOfHandler`, `Respond`, `Responded`,
`ResponseBodies`, `ResponseOutput`, `ResponseOutputOfHandler`,
`ResponseOutputs`, `SentResponse`, `SourceInput`, `SourceSchemas`,
`SourceValue`, `StatusMap`, `ValidatedContext`, `ValidatedEventHandler`,
`ValidatedHandlerOptions`, `ValidationDeclarationError`, `ValidationErrorData`,
`ValidationIssue`, `ValidationSchemas`, `ValidationSchemasGuard`,
`ValidationSource`.

**One caveat on `$checkedFetch`.** Re-exporting the errors parent's types also
loads its ambient declarations, so `$checkedFetch` and `event.$checkedFetch`
still _typecheck_ under the umbrella. Nothing binds them: this module installs
`$typedFetch` only, and a call would find `undefined` at runtime. Use the
`Typed` names.

## Repository development

From the repository root:

```sh
pnpm --filter @dphonys/nuxt-typed-handler dev
pnpm --filter @dphonys/nuxt-typed-handler typecheck
pnpm --filter @dphonys/nuxt-typed-handler test
pnpm --filter @dphonys/nuxt-typed-handler build
pnpm --filter @dphonys/nuxt-typed-handler publint
```

This package composes the parents' `internals/*` entries, which are documented
for it alone in each parent's `INTERNALS.md`.

## License

Licensed under the [MIT License](./LICENSE).

[errors]: https://github.com/DPHonys/dph-nuxt-stuff/blob/main/packages/nuxt-handler-errors/README.md
[errors-declaring]: https://github.com/DPHonys/dph-nuxt-stuff/blob/main/packages/nuxt-handler-errors/README.md#declaring-what-a-route-can-fail-with
[errors-fetching]: https://github.com/DPHonys/dph-nuxt-stuff/blob/main/packages/nuxt-handler-errors/README.md#fetching
[errors-channel]: https://github.com/DPHonys/dph-nuxt-stuff/blob/main/packages/nuxt-handler-errors/README.md#channel-gating
[errors-unknown-tag]: https://github.com/DPHonys/dph-nuxt-stuff/blob/main/packages/nuxt-handler-errors/README.md#when-the-call-site-does-not-know-the-tag
[validation]: https://github.com/DPHonys/dph-nuxt-stuff/blob/main/packages/nuxt-handler-validation/README.md
[validation-composing]: https://github.com/DPHonys/dph-nuxt-stuff/blob/main/packages/nuxt-handler-validation/README.md#reusing-and-composing-schemas
[validation-sources]: https://github.com/DPHonys/dph-nuxt-stuff/blob/main/packages/nuxt-handler-validation/README.md#what-each-source-receives
[validation-output]: https://github.com/DPHonys/dph-nuxt-stuff/blob/main/packages/nuxt-handler-validation/README.md#response-output
[validation-troubleshooting]: https://github.com/DPHonys/dph-nuxt-stuff/blob/main/packages/nuxt-handler-validation/README.md#troubleshooting
